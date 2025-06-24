import React, { useState } from 'react';
import { 
  Folder, 
  File, 
  FolderOpen, 
  ChevronRight, 
  ChevronDown, 
  Plus, 
  FileText,
  FolderPlus,
  X,
  Check
} from 'lucide-react';
import { GitHubFile } from '../types/github';

interface FileTreeProps {
  files: GitHubFile[];
  onFileSelect: (file: GitHubFile) => void;
  onCreateFile: (name: string, path: string) => void;
  onCreateFolder: (name: string, path: string) => void;
  selectedFile?: GitHubFile;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
}

export const FileTree: React.FC<FileTreeProps> = ({
  files,
  onFileSelect,
  onCreateFile,
  onCreateFolder,
  selectedFile,
  expandedFolders,
  onToggleFolder,
}) => {
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [createType, setCreateType] = useState<'file' | 'folder' | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [createPath, setCreatePath] = useState('');

  // Build a tree structure from flat file list
  const buildTree = (files: GitHubFile[]) => {
    const tree: { [key: string]: GitHubFile & { children: GitHubFile[] } } = {};
    const roots: (GitHubFile & { children: GitHubFile[] })[] = [];

    // First pass: create nodes
    files.forEach(file => {
      tree[file.path] = { ...file, children: [] };
    });

    // Second pass: build parent-child relationships
    files.forEach(file => {
      const pathParts = file.path.split('/');
      if (pathParts.length > 1) {
        // This is a nested file/folder
        const parentPath = pathParts.slice(0, -1).join('/');
        if (tree[parentPath]) {
          tree[parentPath].children.push(tree[file.path]);
        }
      } else {
        // This is a root level file/folder
        roots.push(tree[file.path]);
      }
    });

    return roots;
  };

  const getFileIcon = (file: GitHubFile) => {
    if (file.type === 'dir') {
      return expandedFolders.has(file.path) ? (
        <FolderOpen className="w-4 h-4 text-blue-500" />
      ) : (
        <Folder className="w-4 h-4 text-blue-500" />
      );
    }
    return <File className="w-4 h-4 text-gray-500 dark:text-gray-400" />;
  };

  const getFileExtensionColor = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'html':
        return 'text-orange-600 dark:text-orange-400';
      case 'css':
        return 'text-blue-600 dark:text-blue-400';
      case 'js':
      case 'jsx':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'ts':
      case 'tsx':
        return 'text-blue-700 dark:text-blue-300';
      case 'json':
        return 'text-green-600 dark:text-green-400';
      case 'md':
        return 'text-gray-700 dark:text-gray-300';
      case 'py':
        return 'text-green-700 dark:text-green-300';
      case 'java':
        return 'text-red-600 dark:text-red-400';
      case 'cpp':
      case 'c':
        return 'text-purple-600 dark:text-purple-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const handleCreate = () => {
    if (!newItemName.trim() || !createType) return;
    
    const fullPath = createPath ? `${createPath}/${newItemName}` : newItemName;
    
    if (createType === 'file') {
      onCreateFile(newItemName, fullPath);
    } else {
      onCreateFolder(newItemName, fullPath);
    }
    
    setNewItemName('');
    setCreateType(null);
    setShowCreateMenu(false);
    setCreatePath('');
  };

  const handleCancel = () => {
    setNewItemName('');
    setCreateType(null);
    setShowCreateMenu(false);
    setCreatePath('');
  };

  const handleFolderClick = (file: GitHubFile, e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFolder(file.path);
  };

  const renderFileTreeItem = (file: GitHubFile & { children: GitHubFile[] }, depth: number = 0) => {
    const isExpanded = expandedFolders.has(file.path);
    const isSelected = selectedFile?.path === file.path;

    return (
      <div key={file.path}>
        <div
          className={`flex items-center gap-2 py-1.5 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 group ${
            isSelected
              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 shadow-sm'
              : 'text-gray-700 dark:text-gray-300'
          }`}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
          onClick={() => {
            if (file.type === 'dir') {
              onToggleFolder(file.path);
            } else {
              onFileSelect(file);
            }
          }}
        >
          {file.type === 'dir' && (
            <button 
              className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors flex-shrink-0"
              onClick={(e) => handleFolderClick(file, e)}
            >
              {isExpanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </button>
          )}
          
          {file.type !== 'dir' && (
            <div className="w-4 h-3 flex-shrink-0" /> // Spacer for files to align with folders
          )}
          
          {getFileIcon(file)}
          <span className={`text-sm truncate font-medium flex-1 ${getFileExtensionColor(file.name)}`}>
            {file.name}
          </span>
          {isSelected && (
            <div className="w-2 h-2 bg-blue-500 rounded-full ml-auto opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          )}
        </div>
        
        {/* Render children if folder is expanded */}
        {file.type === 'dir' && isExpanded && file.children.length > 0 && (
          <div>
            {file.children
              .sort((a, b) => {
                // Sort directories first, then files
                if (a.type === 'dir' && b.type !== 'dir') return -1;
                if (a.type !== 'dir' && b.type === 'dir') return 1;
                return a.name.localeCompare(b.name);
              })
              .map(child => renderFileTreeItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const treeData = buildTree(files);

  return (
    <div className="space-y-1">
      {/* Create Menu */}
      <div className="px-2 py-2 border-b border-gray-200 dark:border-gray-700">
        {!showCreateMenu ? (
          <button
            onClick={() => setShowCreateMenu(true)}
            className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
          >
            <Plus className="w-4 h-4" />
            New File or Folder
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                onClick={() => setCreateType('file')}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                  createType === 'file'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                <FileText className="w-3 h-3" />
                File
              </button>
              <button
                onClick={() => setCreateType('folder')}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                  createType === 'folder'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                <FolderPlus className="w-3 h-3" />
                Folder
              </button>
            </div>
            
            {createType && (
              <div className="flex gap-1">
                <input
                  type="text"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder={`${createType} name`}
                  className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') handleCreate();
                    if (e.key === 'Escape') handleCancel();
                  }}
                  autoFocus
                />
                <button
                  onClick={handleCreate}
                  className="p-1 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  onClick={handleCancel}
                  className="p-1 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* File Tree */}
      <div>
        {treeData
          .sort((a, b) => {
            // Sort directories first, then files
            if (a.type === 'dir' && b.type !== 'dir') return -1;
            if (a.type !== 'dir' && b.type === 'dir') return 1;
            return a.name.localeCompare(b.name);
          })
          .map(file => renderFileTreeItem(file))}
      </div>
    </div>
  );
};