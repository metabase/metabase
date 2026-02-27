import {useCommand} from "reactive-vscode"
import {ProgressLocation, window} from "vscode"

import type {TransformNode} from "../metabase-lib"
import type {ExtensionCtx} from "../extension-context"
import {config} from "../config"
import {
  getPendingInputs,
  grantWorkspaceInputs,
  registerTransform,
  runTransform,
  translateEntityIds,
} from "../metabase-client"

// Cache of entity name → numeric ID per host, to avoid repeated translation API calls
const entityIdCache = new Map<string, number>()

async function resolveEntityId(
  host: string,
  key: string,
  type: string,
  name: string,
  outputChannel: ExtensionCtx["outputChannel"],
): Promise<number | undefined> {
  const cacheKey = `${host}::${type}::${name}`
  const cached = entityIdCache.get(cacheKey)
  if (cached !== undefined) {
    outputChannel.appendLine(`Entity ID cache hit: ${cacheKey} → ${cached}`)
    return cached
  }

  const translation = await translateEntityIds(host, key, {[type]: [name]})
  if (translation.status !== "success") return undefined

  const entry = translation.translations.entity_ids?.[name]
  if (entry?.id) {
    entityIdCache.set(cacheKey, entry.id)
    outputChannel.appendLine(`Entity ID cached: ${cacheKey} → ${entry.id}`)
  }
  return entry?.id
}

export function registerRunTransformCommand(ctx: ExtensionCtx) {
  useCommand("metastudio.runTransform", async (node: TransformNode) => {
    const host = config.host
    const key = ctx.apiKey.value
    if (!host || !key) {
      window.showErrorMessage("Metabase host and API key must be configured first.")
      return
    }

    const dbName = node.sourceDatabaseId
    if (!dbName) {
      window.showErrorMessage(`Transform "${node.name}" has no source database configured.`)
      return
    }

    ctx.outputChannel.appendLine(`Running transform "${node.name}" (database: ${dbName})`)

    await window.withProgress(
      {location: ProgressLocation.Notification, title: `Running transform "${node.name}"`, cancellable: false},
      async (progress) => {
        try {
          // 1. Translate database name → numeric ID (cached)
          progress.report({message: "Resolving database..."})
          const dbId = await resolveEntityId(host, key, "database", dbName, ctx.outputChannel)
          if (!dbId) {
            window.showErrorMessage(`Database "${dbName}" not found on Metabase instance.`)
            return
          }
          ctx.outputChannel.appendLine(`Resolved database "${dbName}" → id=${dbId}`)

          // 2. Get or create workspace for this database
          progress.report({message: "Preparing workspace..."})
          const ws = await ctx.workspaceManager.getOrCreate(
            {host, databaseName: dbName},
            key,
            `Metastudio: ${ctx.metastudioId.value} ${dbName}`,
            dbId,
          )

          // 3. Resolve entity IDs in source and target (names → numeric IDs)
          progress.report({message: "Resolving entity IDs..."})
          const source = structuredClone(node.raw.source) as Record<string, unknown>
          const target = structuredClone(node.raw.target) as Record<string, unknown>

          // Replace database name with numeric ID in source.query.database
          const sourceQuery = source.query as Record<string, unknown> | undefined
          if (sourceQuery && typeof sourceQuery.database === "string") {
            const srcDbId = await resolveEntityId(host, key, "database", sourceQuery.database, ctx.outputChannel)
            if (srcDbId) {
              sourceQuery.database = srcDbId
            } else {
              window.showErrorMessage(`Source database "${sourceQuery.database}" not found.`)
              return
            }
          }

          // Replace database name with numeric ID in target.database
          if (typeof target.database === "string") {
            const tgtDbId = await resolveEntityId(host, key, "database", target.database, ctx.outputChannel)
            if (tgtDbId) {
              target.database = tgtDbId
            } else {
              window.showErrorMessage(`Target database "${target.database}" not found.`)
              return
            }
          }

          // Workspaces only support native SQL and Python transforms
          if (sourceQuery && sourceQuery.type === "query") {
            window.showErrorMessage(
              "Transforms based on the query builder cannot be run in a workspace.",
            )
            return
          }

          ctx.outputChannel.appendLine(`Resolved source: ${JSON.stringify(source)}`)
          ctx.outputChannel.appendLine(`Resolved target: ${JSON.stringify(target)}`)

          // 4. Register transform in workspace
          progress.report({message: "Registering transform..."})
          const registered = await registerTransform(host, ws.api_key, ws.id, node.entityId, {
            global_id: node.raw.global_id,
            name: node.name,
            description: node.description,
            source,
            target,
          })
          if (registered.status !== "success") {
            window.showErrorMessage(`Failed to register transform: ${registered.message}`)
            return
          }

          // 5. Grant access to any pending input tables (requires admin API key)
          progress.report({message: "Granting input access..."})
          const pending = await getPendingInputs(host, key, ws.id)
          if (pending.status === "success" && pending.inputs.length > 0) {
            const tableNames = pending.inputs.map(t => `${t.schema ?? ""}.${t.table}`).join(", ")
            ctx.outputChannel.appendLine(`Granting access to ${pending.inputs.length} pending input(s): ${tableNames}`)
            const grant = await grantWorkspaceInputs(host, key, ws.id, pending.inputs)
            if (grant.status !== "success") {
              window.showErrorMessage(
                `Cannot grant input table access (${tableNames}). `
                + `Your API key may not have admin privileges. `
                + `Ask a Metabase admin to grant workspace input access for workspace ${ws.id}.`,
              )
              return
            }
          }

          // 6. Run the transform
          progress.report({message: "Executing..."})
          const result = await runTransform(host, ws.api_key, ws.id, registered.transform.ref_id)
          if (result.status !== "success") {
            // Parse specific error cases for better messages
            const errorBody = result.message ?? ""
            if (errorBody.includes("have not been granted access")) {
              // Extract table names from the error if possible
              try {
                const parsed = JSON.parse(errorBody.replace(/^HTTP \d+: /, ""))
                const tables = (parsed.ungranted_tables ?? parsed["ungranted-tables"] ?? [])
                  .map((t: {schema?: string; table?: string}) => `${t.schema ?? ""}.${t.table}`)
                  .join(", ")
                window.showErrorMessage(
                  `Transform input tables not granted: ${tables || "(unknown)"}. `
                  + `Ask a Metabase admin to grant workspace input access for workspace ${ws.id}.`,
                )
              } catch {
                window.showErrorMessage(
                  `Transform input tables not granted. `
                  + `Ask a Metabase admin to grant workspace input access for workspace ${ws.id}.`,
                )
              }
            } else if (errorBody.includes("permission denied")) {
              window.showErrorMessage(
                `Database permission denied. The workspace service account does not have `
                + `read access to the required tables. Ask a database administrator to grant `
                + `SELECT permissions to the workspace service account on the source tables.`,
              )
            } else {
              window.showErrorMessage(`Failed to run transform: ${result.message}`)
            }
            return
          }

          // 7. Report result
          if (result.result.status === "succeeded") {
            window.showInformationMessage(`Transform "${node.name}" succeeded (table: ${result.result.table.schema}.${result.result.table.name})`)
          } else {
            window.showErrorMessage(`Transform "${node.name}" ${result.result.status}: ${result.result.message ?? "no details"}`)
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          ctx.outputChannel.appendLine(`runTransform error: ${message}`)
          window.showErrorMessage(`Transform "${node.name}" failed: ${message}`)
        }
      },
    )
  })
}
