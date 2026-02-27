import * as fs from 'node:fs/promises'
import type {
  Disposable,
  Event,
  FileChangeEvent,
  FileStat,
  FileSystemProvider,
  Uri,
} from 'vscode'
import {
  EventEmitter,
  FileChangeType,
  FileSystemError,
  FileType,
  workspace,
} from 'vscode'
import {extractCodeFromYaml, updateCodeInYaml} from './yaml-code-helpers'

// --- URI helpers ---

function parseEmbeddedUri(uri: Uri): { yamlPath: string; lang: 'sql' | 'python' } {
  const params = new URLSearchParams(uri.query)
  const yamlPath = params.get('yaml')
  const lang = params.get('lang')
  if (!yamlPath) throw FileSystemError.FileNotFound(uri)
  if (lang !== 'sql' && lang !== 'python') throw FileSystemError.FileNotFound(uri)
  return { yamlPath, lang }
}

// --- FileSystemProvider ---

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export class EmbeddedCodeProvider implements FileSystemProvider {
  private _onDidChangeFile = new EventEmitter<FileChangeEvent[]>()
  readonly onDidChangeFile: Event<FileChangeEvent[]> = this._onDidChangeFile.event

  private watchers = new Map<string, Disposable>()

  watch(uri: Uri): Disposable {
    const { yamlPath } = parseEmbeddedUri(uri)
    if (!this.watchers.has(yamlPath)) {
      const watcher = workspace.createFileSystemWatcher(yamlPath)
      const onChange = () => {
        this._onDidChangeFile.fire([{ type: FileChangeType.Changed, uri }])
      }
      const onDelete = () => {
        this._onDidChangeFile.fire([{ type: FileChangeType.Deleted, uri }])
      }
      const disposable = {
        dispose: () => {
          watcher.dispose()
          this.watchers.delete(yamlPath)
        },
      }
      watcher.onDidChange(onChange)
      watcher.onDidDelete(onDelete)
      this.watchers.set(yamlPath, disposable)
    }
    return { dispose: () => {} }
  }

  async stat(uri: Uri): Promise<FileStat> {
    const { yamlPath } = parseEmbeddedUri(uri)
    try {
      const stat = await fs.stat(yamlPath)
      return {
        type: FileType.File,
        ctime: stat.ctimeMs,
        mtime: stat.mtimeMs,
        size: stat.size,
      }
    } catch {
      throw FileSystemError.FileNotFound(uri)
    }
  }

  async readFile(uri: Uri): Promise<Uint8Array> {
    const { yamlPath, lang } = parseEmbeddedUri(uri)
    try {
      const content = await fs.readFile(yamlPath, 'utf-8')
      const code = extractCodeFromYaml(content, lang)
      return encoder.encode(code)
    } catch (error) {
      if (error instanceof FileSystemError) throw error
      throw FileSystemError.FileNotFound(uri)
    }
  }

  async writeFile(uri: Uri, content: Uint8Array): Promise<void> {
    const { yamlPath, lang } = parseEmbeddedUri(uri)
    const newCode = decoder.decode(content)
    try {
      const yamlContent = await fs.readFile(yamlPath, 'utf-8')
      const updated = updateCodeInYaml(yamlContent, lang, newCode)
      await fs.writeFile(yamlPath, updated, 'utf-8')
    } catch (error) {
      if (error instanceof FileSystemError) throw error
      throw FileSystemError.Unavailable(uri)
    }
  }

  readDirectory(): [string, FileType][] {
    throw FileSystemError.NoPermissions()
  }

  createDirectory(): void {
    throw FileSystemError.NoPermissions()
  }

  delete(): void {
    throw FileSystemError.NoPermissions()
  }

  rename(): void {
    throw FileSystemError.NoPermissions()
  }
}
