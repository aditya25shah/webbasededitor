import React, { useState, useEffect } from 'react';
import Split from 'react-split';
import { GitHubAuth } from './components/GitHubAuth';
import { RepoSelector } from './components/RepoSelector';
import { FileTree } from './components/FileTree';
import { CodeEditor } from './components/CodeEditor';
import { LivePreview } from './components/LivePreview';
import { Toolbar } from './components/Toolbar';
import { CommitHistory } from './components/CommitHistory';
import { GitHubAPI } from './utils/github';
import { formatCode, getLanguageFromFilename } from './utils/formatter';
import { GitHubRepo, GitHubBranch, GitHubFile, GitHubCommit, GitHubUser } from './types/github';

const STORAGE_KEYS = {
  GITHUB_TOKEN: 'github_token',
  THEME: 'editor_theme',
  LAYOUT: 'editor_layout',
};

function App() {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [githubAPI, setGithubAPI] = useState<GitHubAPI | null>(null);
  const [user, setUser] = useState<GitHubUser | null>(null);

  // Repository state
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<GitHubBranch | null>(null);

  // File state
  const [files, setFiles] = useState<GitHubFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<GitHubFile | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [localFiles, setLocalFiles] = useState<Map<string, string>>(new Map());

  // UI state
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [loading, setLoading] = useState(false);
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize theme and check for stored token
  useEffect(() => {
    const storedTheme = localStorage.getItem(STORAGE_KEYS.THEME) as 'light' | 'dark';
    if (storedTheme) {
      setTheme(storedTheme);
      document.documentElement.classList.toggle('dark', storedTheme === 'dark');
    }

    const storedToken = localStorage.getItem(STORAGE_KEYS.GITHUB_TOKEN);
    if (storedToken) {
      handleAuth(storedToken);
    }
  }, []);

  // Track changes
  useEffect(() => {
    setHasChanges(fileContent !== originalContent);
  }, [fileContent, originalContent]);

  const handleAuth = async (token: string) => {
    try {
      setLoading(true);
      const api = new GitHubAPI(token);
      const userData = await api.getUser();
      
      setGithubAPI(api);
      setUser(userData);
      setIsAuthenticated(true);
      localStorage.setItem(STORAGE_KEYS.GITHUB_TOKEN, token);
      
      // Load repositories
      const repoData = await api.getRepositories();
      setRepos(repoData);
    } catch (error) {
      console.error('Authentication failed:', error);
      alert('Authentication failed. Please check your token.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setGithubAPI(null);
    setUser(null);
    setRepos([]);
    setSelectedRepo(null);
    setBranches([]);
    setSelectedBranch(null);
    setFiles([]);
    setSelectedFile(null);
    setFileContent('');
    setOriginalContent('');
    setLocalFiles(new Map());
    localStorage.removeItem(STORAGE_KEYS.GITHUB_TOKEN);
  };

  const handleRepoSelect = async (repo: GitHubRepo) => {
    if (!githubAPI) return;
    
    try {
      setLoading(true);
      setSelectedRepo(repo);
      
      // Load branches
      const [owner, repoName] = repo.full_name.split('/');
      const branchData = await githubAPI.getBranches(owner, repoName);
      setBranches(branchData);
      
      // Select default branch
      const defaultBranch = branchData.find(b => b.name === repo.default_branch) || branchData[0];
      if (defaultBranch) {
        setSelectedBranch(defaultBranch);
        await loadRepoFiles(repo, defaultBranch);
      }
    } catch (error) {
      console.error('Failed to load repository:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBranchSelect = async (branch: GitHubBranch) => {
    if (!githubAPI || !selectedRepo) return;
    
    setSelectedBranch(branch);
    await loadRepoFiles(selectedRepo, branch);
  };

  const loadRepoFiles = async (repo: GitHubRepo, branch: GitHubBranch) => {
    if (!githubAPI) return;
    
    try {
      setLoading(true);
      const [owner, repoName] = repo.full_name.split('/');
      const fileData = await githubAPI.getRepoContents(owner, repoName, '', branch.name);
      setFiles(fileData);
      
      // Load commits
      const commitData = await githubAPI.getCommits(owner, repoName, branch.name);
      setCommits(commitData);
      
      // Auto-select index.html if it exists
      const indexFile = fileData.find(f => f.name === 'index.html' && f.type === 'file');
      if (indexFile) {
        await handleFileSelect(indexFile);
      }
    } catch (error) {
      console.error('Failed to load repository files:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (file: GitHubFile) => {
    if (file.type !== 'file') return;
    
    // Check if it's a local file first
    if (localFiles.has(file.path)) {
      const content = localFiles.get(file.path) || '';
      setSelectedFile(file);
      setFileContent(content);
      setOriginalContent(content);
      return;
    }
    
    // Load from GitHub if it's a GitHub file
    if (!githubAPI || !selectedRepo || !selectedBranch) return;
    
    try {
      setLoading(true);
      const [owner, repoName] = selectedRepo.full_name.split('/');
      const content = await githubAPI.getFileContent(owner, repoName, file.path, selectedBranch.name);
      
      setSelectedFile(file);
      setFileContent(content);
      setOriginalContent(content);
    } catch (error) {
      console.error('Failed to load file:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFile = (name: string, path: string) => {
    const newFile: GitHubFile = {
      name,
      path,
      type: 'file',
      size: 0,
    };
    
    // Add to files list
    setFiles(prev => [...prev, newFile]);
    
    // Create empty content for the file
    const defaultContent = getDefaultFileContent(name);
    setLocalFiles(prev => new Map(prev).set(path, defaultContent));
    
    // Select the new file
    setSelectedFile(newFile);
    setFileContent(defaultContent);
    setOriginalContent('');
  };

  const handleCreateFolder = (name: string, path: string) => {
    const newFolder: GitHubFile = {
      name,
      path,
      type: 'dir',
    };
    
    setFiles(prev => [...prev, newFolder]);
    setExpandedFolders(prev => new Set(prev).add(path));
  };

  const getDefaultFileContent = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    
    switch (ext) {
      case 'html':
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
</head>
<body>
    <h1>Hello World!</h1>
</body>
</html>`;
      
      case 'css':
        return `/* CSS Styles */
body {
    font-family: Arial, sans-serif;
    margin: 0;
    padding: 20px;
}`;
      
      case 'js':
        return `// JavaScript
console.log('Hello World!');`;
      
      case 'ts':
        return `// TypeScript
const message: string = 'Hello World!';
console.log(message);`;
      
      case 'json':
        return `{
  "name": "example",
  "version": "1.0.0"
}`;
      
      case 'md':
        return `# ${fileName.replace('.md', '')}

This is a markdown file.`;
      
      default:
        return '';
    }
  };

  const handleToggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  const handleSave = async () => {
    if (!selectedFile) return;
    
    // If it's a local file, just update the local storage
    if (localFiles.has(selectedFile.path)) {
      setLocalFiles(prev => new Map(prev).set(selectedFile.path, fileContent));
      setOriginalContent(fileContent);
      return;
    }
    
    // Save to GitHub
    if (!githubAPI || !selectedRepo || !selectedBranch) return;
    
    try {
      setLoading(true);
      const [owner, repoName] = selectedRepo.full_name.split('/');
      
      await githubAPI.updateFile(
        owner,
        repoName,
        selectedFile.path,
        fileContent,
        `Update ${selectedFile.name}`,
        selectedFile.sha,
        selectedBranch.name
      );
      
      setOriginalContent(fileContent);
      alert('File saved successfully!');
      
      // Reload commits
      const commitData = await githubAPI.getCommits(owner, repoName, selectedBranch.name);
      setCommits(commitData);
    } catch (error) {
      console.error('Failed to save file:', error);
      alert('Failed to save file. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePush = async () => {
    await handleSave();
  };

  const handleFormat = async () => {
    if (!selectedFile) return;
    
    const language = getLanguageFromFilename(selectedFile.name);
    const formatted = await formatCode(fileContent, language);
    setFileContent(formatted);
  };

  const handleToggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
    localStorage.setItem(STORAGE_KEYS.THEME, newTheme);
  };

  const handleCreateBranch = async (branchName: string) => {
    if (!githubAPI || !selectedRepo || !selectedBranch) return;
    
    try {
      setLoading(true);
      const [owner, repoName] = selectedRepo.full_name.split('/');
      
      await githubAPI.createBranch(owner, repoName, branchName, selectedBranch.commit.sha);
      
      // Reload branches
      const branchData = await githubAPI.getBranches(owner, repoName);
      setBranches(branchData);
      
      // Select the new branch
      const newBranch = branchData.find(b => b.name === branchName);
      if (newBranch) {
        setSelectedBranch(newBranch);
      }
      
      alert(`Branch "${branchName}" created successfully!`);
    } catch (error) {
      console.error('Failed to create branch:', error);
      alert('Failed to create branch. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRunCode = () => {
    if (selectedFile?.name.endsWith('.html')) {
      // For HTML files, the live preview already shows the result
      return;
    }
    
    if (selectedFile?.name.endsWith('.js')) {
      try {
        // Create a new function and execute the code
        const func = new Function(fileContent);
        func();
      } catch (error) {
        console.error('Error running JavaScript:', error);
        alert(`Error running code: ${error}`);
      }
    }
  };

  const handleDownload = () => {
    if (!selectedFile || !fileContent) return;
    
    const blob = new Blob([fileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    if (!selectedFile || !fileContent) return;
    
    try {
      await navigator.clipboard.writeText(fileContent);
      alert('Code copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy code:', error);
      alert('Failed to copy code to clipboard.');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 border border-gray-100 dark:border-gray-700">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-white">CE</span>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                Code Editor Pro
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Professional web-based code editor with GitHub integration
              </p>
            </div>
            
            <GitHubAuth
              onAuth={handleAuth}
              isAuthenticated={isAuthenticated}
              user={user || undefined}
              onLogout={handleLogout}
            />
          </div>
        </div>
      </div>
    );
  }

  const getEditorLanguage = () => {
    if (!selectedFile) return 'html';
    return getLanguageFromFilename(selectedFile.name);
  };

  const isHtmlFile = selectedFile?.name.endsWith('.html') || false;

  return (
    <div className={`h-screen flex flex-col ${theme === 'dark' ? 'dark' : ''} bg-gray-50 dark:bg-gray-900`}>
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-sm font-bold text-white">CE</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Code Editor Pro
            </h1>
          </div>
          <GitHubAuth
            onAuth={handleAuth}
            isAuthenticated={isAuthenticated}
            user={user || undefined}
            onLogout={handleLogout}
          />
        </div>
        
        <RepoSelector
          repos={repos}
          branches={branches}
          selectedRepo={selectedRepo || undefined}
          selectedBranch={selectedBranch || undefined}
          onRepoSelect={handleRepoSelect}
          onBranchSelect={handleBranchSelect}
          onCreateBranch={handleCreateBranch}
          loading={loading}
        />
        
        <Toolbar
          onSave={handleSave}
          onPush={handlePush}
          onFormat={handleFormat}
          onToggleTheme={handleToggleTheme}
          onShowHistory={() => setShowHistory(true)}
          onRunCode={handleRunCode}
          onDownload={handleDownload}
          onShare={handleShare}
          theme={theme}
          hasChanges={hasChanges}
          isLoading={loading}
        />
      </div>

      <div className="flex-1 overflow-hidden">
        <Split
          className="flex h-full"
          sizes={isHtmlFile ? [20, 50, 30] : [25, 75]}
          minSize={200}
          expandToMin={false}
          gutterSize={6}
          gutterAlign="center"
          snapOffset={30}
          dragInterval={1}
          direction="horizontal"
          cursor="col-resize"
          gutterStyle={() => ({
            backgroundColor: theme === 'dark' ? '#374151' : '#e5e7eb',
          })}
        >
          {/* File Tree */}
          <div className="bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
            <div className="h-full flex flex-col">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Explorer</h3>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                <FileTree
                  files={files}
                  onFileSelect={handleFileSelect}
                  onCreateFile={handleCreateFile}
                  onCreateFolder={handleCreateFolder}
                  selectedFile={selectedFile || undefined}
                  expandedFolders={expandedFolders}
                  onToggleFolder={handleToggleFolder}
                />
              </div>
            </div>
          </div>

          {/* Code Editor */}
          <div className="bg-white dark:bg-gray-900 flex flex-col shadow-sm">
            <div className="flex-1 overflow-hidden">
              {selectedFile ? (
                <CodeEditor
                  value={fileContent}
                  onChange={setFileContent}
                  language={getEditorLanguage()}
                  theme={theme}
                  onFormat={handleFormat}
                  fileName={selectedFile.name}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-2xl">📝</span>
                    </div>
                    <p className="text-lg font-medium mb-2">No file selected</p>
                    <p className="text-sm">Choose a file from the explorer or create a new one</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Live Preview - only show for HTML files */}
          {isHtmlFile && (
            <div className="bg-white border-l border-gray-200 dark:border-gray-700 shadow-sm">
              <LivePreview
                htmlContent={fileContent}
                onRefresh={() => {}}
              />
            </div>
          )}
        </Split>
      </div>

      <CommitHistory
        commits={commits}
        onClose={() => setShowHistory(false)}
        isOpen={showHistory}
      />
    </div>
  );
}

export default App;