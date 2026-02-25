import type {OutputChannel} from 'vscode'

let log: OutputChannel | undefined

export function setOutputChannel(channel: OutputChannel) {
  log = channel
}

export type ConnectionResult =
  | { status: 'missing-host' }
  | { status: 'missing-api-key' }
  | { status: 'unauthorized' }
  | { status: 'network-error'; message: string }
  | { status: 'http-error'; statusCode: number; statusText: string }
  | { status: 'success'; firstName: string; lastName: string; email: string }

export async function checkMetabaseConnection(host: string | undefined, apiKey: string | undefined): Promise<ConnectionResult> {
  log?.appendLine(`checkConnection: host=${host}, apiKey=${apiKey ? '(set)' : '(not set)'}`)

  if (!host) {
    log?.appendLine('checkConnection: missing host')
    return {status: 'missing-host'}
  }

  if (!apiKey) {
    log?.appendLine('checkConnection: missing API key')
    return {status: 'missing-api-key'}
  }

  const baseUrl = host.replace(/\/+$/, '')
  const url = `${baseUrl}/api/user/current`
  log?.appendLine(`checkConnection: fetching ${url}`)

  let response: Response
  try {
    response = await fetch(url, {
      headers: {'x-api-key': apiKey},
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log?.appendLine(`checkConnection: network error - ${message}`)
    return {status: 'network-error', message}
  }

  log?.appendLine(`checkConnection: response ${response.status} ${response.statusText}`)

  if (response.status === 401 || response.status === 403) {
    return {status: 'unauthorized'}
  }

  if (!response.ok) {
    return {status: 'http-error', statusCode: response.status, statusText: response.statusText}
  }

  const data = await response.json()
  log?.appendLine(`checkConnection: success - ${data.first_name} ${data.last_name}`)
  return {
    status: 'success',
    firstName: data.first_name,
    lastName: data.last_name,
    email: data.email,
  }
}

export interface Workspace {
  id: number
  name: string
  collection_id: number
  database_id: number
  created_at: string
  updated_at: string
  api_key: string
  status: string
}

export type WorkspaceResult =
  | { status: 'success'; workspace: Workspace }
  | { status: 'network-error'; message: string }
  | { status: 'http-error'; statusCode: number; statusText: string }

export async function createWorkspace(host: string, apiKey: string, name: string, databaseId: number): Promise<WorkspaceResult> {
  const baseUrl = host.replace(/\/+$/, '')
  const url = `${baseUrl}/api/ee/workspace/`
  log?.appendLine(`createWorkspace: POST ${url} name=${name} database_id=${databaseId}`)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {'x-api-key': apiKey, 'Content-Type': 'application/json'},
      body: JSON.stringify({name, database_id: databaseId}),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log?.appendLine(`createWorkspace: network error - ${message}`)
    return {status: 'network-error', message}
  }

  log?.appendLine(`createWorkspace: response ${response.status} ${response.statusText}`)

  if (!response.ok) {
    const body = await response.text().catch(() => '(unreadable)')
    log?.appendLine(`createWorkspace: error body - ${body}`)
    return {status: 'http-error', statusCode: response.status, statusText: response.statusText}
  }

  const data = await response.json()
  log?.appendLine(`createWorkspace: success - workspace "${data.name}" (id=${data.id})`)
  return {status: 'success', workspace: data}
}

export interface TranslationEntry {
  id: number
  type: string
  status: string
}

export interface TranslationResult {
  status: 'success'
  translations: { entity_ids: Record<string, TranslationEntry> }
}

export async function translateEntityIds(
  host: string,
  apiKey: string,
  entityIds: Record<string, string[]>,
): Promise<TranslationResult | { status: 'error'; message: string }> {
  const baseUrl = host.replace(/\/+$/, '')
  const url = `${baseUrl}/api/eid-translation/translate`
  log?.appendLine(`translateEntityIds: POST ${url} ${JSON.stringify(entityIds)}`)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {'x-api-key': apiKey, 'Content-Type': 'application/json'},
      body: JSON.stringify({entity_ids: entityIds}),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log?.appendLine(`translateEntityIds: network error - ${message}`)
    return {status: 'error', message}
  }

  log?.appendLine(`translateEntityIds: response ${response.status} ${response.statusText}`)

  if (!response.ok) {
    const body = await response.text().catch(() => '(unreadable)')
    log?.appendLine(`translateEntityIds: error body - ${body}`)
    return {status: 'error', message: `HTTP ${response.status}: ${response.statusText}`}
  }

  const data = await response.json()
  log?.appendLine(`translateEntityIds: success - ${JSON.stringify(data)}`)
  return {status: 'success', translations: data}
}

export interface RegisteredTransform {
  ref_id: string
  workspace_id: number
  global_id: number
  name: string

  [key: string]: unknown
}

export async function registerTransform(
  host: string,
  workspaceApiKey: string,
  workspaceId: number,
  refId: string,
  transform: {
    global_id: unknown
    name: string
    description: string | null
    source: unknown
    target: unknown
    tag_ids?: unknown[]
  },
): Promise<{ status: 'success'; transform: RegisteredTransform } | { status: 'error'; message: string }> {
  const baseUrl = host.replace(/\/+$/, '')
  const url = `${baseUrl}/api/ee/workspace/${workspaceId}/transform/${refId}`
  log?.appendLine(`registerTransform: PUT ${url} name=${transform.name}`)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'PUT',
      headers: {'x-api-key': workspaceApiKey, 'Content-Type': 'application/json'},
      body: JSON.stringify(transform),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log?.appendLine(`registerTransform: network error - ${message}`)
    return {status: 'error', message}
  }

  log?.appendLine(`registerTransform: response ${response.status} ${response.statusText}`)

  if (!response.ok) {
    const body = await response.text().catch(() => '(unreadable)')
    log?.appendLine(`registerTransform: error body - ${body}`)
    return {status: 'error', message: `HTTP ${response.status}: ${body}`}
  }

  const data = await response.json()
  log?.appendLine(`registerTransform: success - ref_id=${data.ref_id}`)
  return {status: 'success', transform: data}
}

export interface PendingInput {
  db_id: number
  schema: string | null
  table: string
}

export async function getPendingInputs(
  host: string,
  apiKey: string,
  workspaceId: number,
): Promise<{ status: 'success'; inputs: PendingInput[] } | { status: 'error'; message: string }> {
  const baseUrl = host.replace(/\/+$/, '')
  const url = `${baseUrl}/api/ee/workspace/${workspaceId}/input/pending`
  log?.appendLine(`getPendingInputs: GET ${url}`)

  let response: Response
  try {
    response = await fetch(url, {
      headers: {'x-api-key': apiKey},
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log?.appendLine(`getPendingInputs: network error - ${message}`)
    return {status: 'error', message}
  }

  log?.appendLine(`getPendingInputs: response ${response.status} ${response.statusText}`)

  if (!response.ok) {
    const body = await response.text().catch(() => '(unreadable)')
    log?.appendLine(`getPendingInputs: error body - ${body}`)
    return {status: 'error', message: `HTTP ${response.status}: ${body}`}
  }

  const data = await response.json()
  log?.appendLine(`getPendingInputs: ${data.inputs?.length ?? 0} pending inputs`)
  return {status: 'success', inputs: data.inputs}
}

export async function grantWorkspaceInputs(
  host: string,
  apiKey: string,
  workspaceId: number,
  tables: PendingInput[],
): Promise<{ status: 'success' } | { status: 'error'; message: string }> {
  const baseUrl = host.replace(/\/+$/, '')
  const url = `${baseUrl}/api/ee/workspace/${workspaceId}/input/grant`
  log?.appendLine(`grantWorkspaceInputs: POST ${url} tables=${JSON.stringify(tables)}`)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {'x-api-key': apiKey, 'Content-Type': 'application/json'},
      body: JSON.stringify({tables}),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log?.appendLine(`grantWorkspaceInputs: network error - ${message}`)
    return {status: 'error', message}
  }

  log?.appendLine(`grantWorkspaceInputs: response ${response.status} ${response.statusText}`)

  if (!response.ok) {
    const body = await response.text().catch(() => '(unreadable)')
    log?.appendLine(`grantWorkspaceInputs: error body - ${body}`)
    return {status: 'error', message: `HTTP ${response.status}: ${body}`}
  }

  const data = await response.json()
  log?.appendLine(`grantWorkspaceInputs: already_granted=${data.already_granted?.length ?? 0} newly_granted=${data.newly_granted?.length ?? 0}`)
  return {status: 'success'}
}

export interface TransformRunResult {
  status: string
  start_time: string
  end_time: string
  message: string | null
  table: { name: string; schema: string }
}

export interface WorkspaceOutputTableEntry {
  transform_id: string | number | null
  schema: string | null
  table: string
  table_id: number | null
}

export interface WorkspaceOutputTable {
  db_id: number
  global: WorkspaceOutputTableEntry
  isolated: WorkspaceOutputTableEntry
}

export interface WorkspaceTablesResult {
  inputs: unknown[]
  outputs: WorkspaceOutputTable[]
}

export async function getWorkspaceTables(
  host: string,
  workspaceApiKey: string,
  workspaceId: number,
): Promise<{ status: 'success'; result: WorkspaceTablesResult } | { status: 'error'; message: string }> {
  const baseUrl = host.replace(/\/+$/, '')
  const url = `${baseUrl}/api/ee/workspace/${workspaceId}/table`
  log?.appendLine(`getWorkspaceTables: GET ${url}`)

  let response: Response
  try {
    response = await fetch(url, {
      headers: {'x-api-key': workspaceApiKey},
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log?.appendLine(`getWorkspaceTables: network error - ${message}`)
    return {status: 'error', message}
  }

  log?.appendLine(`getWorkspaceTables: response ${response.status} ${response.statusText}`)

  if (!response.ok) {
    const body = await response.text().catch(() => '(unreadable)')
    log?.appendLine(`getWorkspaceTables: error body - ${body}`)
    return {status: 'error', message: `HTTP ${response.status}: ${response.statusText}`}
  }

  const data = await response.json() as WorkspaceTablesResult
  log?.appendLine(`getWorkspaceTables: ${data.outputs?.length ?? 0} outputs, raw=${JSON.stringify(data).slice(0, 500)}`)
  return {status: 'success', result: data}
}

export interface TableSchemaResult {
  fields: { name: string; base_type: string }[]
}

export async function getTableSchema(
  host: string,
  workspaceApiKey: string,
  dbId: number,
  tableId: number,
): Promise<{ status: 'success'; result: TableSchemaResult } | { status: 'error'; message: string }> {
  const baseUrl = host.replace(/\/+$/, '')
  const url = `${baseUrl}/api/dataset`
  log?.appendLine(`getTableSchema: POST ${url} db=${dbId} table=${tableId}`)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {'x-api-key': workspaceApiKey, 'content-type': 'application/json'},
      body: JSON.stringify({
        database: dbId,
        type: 'query',
        query: {'source-table': tableId, limit: 0},
      }),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log?.appendLine(`getTableSchema: network error - ${message}`)
    return {status: 'error', message}
  }

  log?.appendLine(`getTableSchema: response ${response.status} ${response.statusText}`)

  if (!response.ok) {
    const body = await response.text().catch(() => '(unreadable)')
    log?.appendLine(`getTableSchema: error body - ${body}`)
    return {status: 'error', message: `HTTP ${response.status}: ${response.statusText}`}
  }

  const data = await response.json()
  const result: TableSchemaResult = {
    fields: (data.data?.cols ?? []).map((c: {name: string; base_type: string}) => ({name: c.name, base_type: c.base_type})),
  }
  log?.appendLine(`getTableSchema: got ${result.fields.length} fields`)
  return {status: 'success', result}
}

export interface TableDataResult {
  cols: { name: string; base_type: string }[]
  rows: unknown[][]
}

export async function getTableData(
  host: string,
  apiKey: string,
  tableId: number,
): Promise<{ status: 'success'; result: TableDataResult } | { status: 'error'; message: string }> {
  const baseUrl = host.replace(/\/+$/, '')
  const url = `${baseUrl}/api/table/${tableId}/data`
  log?.appendLine(`getTableData: GET ${url}`)

  let response: Response
  try {
    response = await fetch(url, {
      headers: {'x-api-key': apiKey},
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log?.appendLine(`getTableData: network error - ${message}`)
    return {status: 'error', message}
  }

  log?.appendLine(`getTableData: response ${response.status} ${response.statusText}`)

  if (!response.ok) {
    const body = await response.text().catch(() => '(unreadable)')
    log?.appendLine(`getTableData: error body - ${body}`)
    return {status: 'error', message: `HTTP ${response.status}: ${response.statusText}`}
  }

  const data = await response.json()
  const result: TableDataResult = {
    cols: data.data?.cols ?? [],
    rows: data.data?.rows ?? [],
  }
  log?.appendLine(`getTableData: got ${result.rows.length} rows, ${result.cols.length} cols`)
  return {status: 'success', result}
}

export async function runTransform(
  host: string,
  workspaceApiKey: string,
  workspaceId: number,
  refId: string,
): Promise<{ status: 'success'; result: TransformRunResult } | { status: 'error'; message: string }> {
  const baseUrl = host.replace(/\/+$/, '')
  const url = `${baseUrl}/api/ee/workspace/${workspaceId}/transform/${refId}/run`
  log?.appendLine(`runTransform: POST ${url}`)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {'x-api-key': workspaceApiKey, 'Content-Type': 'application/json'},
      body: '{}',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log?.appendLine(`runTransform: network error - ${message}`)
    return {status: 'error', message}
  }

  log?.appendLine(`runTransform: response ${response.status} ${response.statusText}`)

  if (!response.ok) {
    const body = await response.text().catch(() => '(unreadable)')
    log?.appendLine(`runTransform: error body - ${body}`)
    return {status: 'error', message: `HTTP ${response.status}: ${body}`}
  }

  const data = await response.json()
  log?.appendLine(`runTransform: ${data.status} - ${data.message ?? 'no message'}`)
  return {status: 'success', result: data}
}
