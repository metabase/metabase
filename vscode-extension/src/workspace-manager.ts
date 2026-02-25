import type { OutputChannel } from 'vscode'
import type { Workspace } from './metabase-client'
import { createWorkspace } from './metabase-client'

export interface WorkspaceKey {
  host: string
  databaseName: string
}

export type StoredWorkspace = Workspace

type WorkspaceStore = Record<string, StoredWorkspace>

interface SecretRef {
  value: string | null | undefined
  set: (value: string) => Promise<void>
}

function toStoreKey(key: WorkspaceKey): string {
  return `${key.host}::${key.databaseName}`
}

function fromStoreKey(storeKey: string): WorkspaceKey {
  const idx = storeKey.indexOf('::')
  return {
    host: storeKey.slice(0, idx),
    databaseName: storeKey.slice(idx + 2),
  }
}

export class WorkspaceManager {
  private secret: SecretRef
  private log: OutputChannel | undefined

  constructor(secret: SecretRef, log?: OutputChannel) {
    this.secret = secret
    this.log = log
  }

  async getOrCreate(key: WorkspaceKey, userApiKey: string, name: string, databaseId: number): Promise<StoredWorkspace> {
    const existing = await this.get(key)
    if (existing) {
      this.log?.appendLine(`WorkspaceManager: found existing workspace "${existing.name}" for ${toStoreKey(key)}`)
      return existing
    }

    this.log?.appendLine(`WorkspaceManager: creating workspace for ${toStoreKey(key)}`)
    const result = await createWorkspace(key.host, userApiKey, name, databaseId)

    if (result.status !== 'success') {
      throw new Error(`Failed to create workspace: ${result.status}${'message' in result ? ` - ${result.message}` : ''}`)
    }

    const store = await this.load()
    store[toStoreKey(key)] = result.workspace
    await this.save(store)

    this.log?.appendLine(`WorkspaceManager: created workspace "${result.workspace.name}" (id=${result.workspace.id})`)
    return result.workspace
  }

  async get(key: WorkspaceKey): Promise<StoredWorkspace | undefined> {
    const store = await this.load()
    return store[toStoreKey(key)]
  }

  async list(): Promise<Array<WorkspaceKey & StoredWorkspace>> {
    const store = await this.load()
    return Object.entries(store).map(([storeKey, ws]) => ({
      ...fromStoreKey(storeKey),
      ...ws,
    }))
  }

  async remove(key: WorkspaceKey): Promise<void> {
    const store = await this.load()
    delete store[toStoreKey(key)]
    await this.save(store)
    this.log?.appendLine(`WorkspaceManager: removed workspace for ${toStoreKey(key)}`)
  }

  private async load(): Promise<WorkspaceStore> {
    const raw = this.secret.value
    if (!raw) return {}
    try {
      return JSON.parse(raw) as WorkspaceStore
    } catch {
      this.log?.appendLine('WorkspaceManager: failed to parse stored workspaces, resetting')
      return {}
    }
  }

  private async save(store: WorkspaceStore): Promise<void> {
    await this.secret.set(JSON.stringify(store))
  }
}
