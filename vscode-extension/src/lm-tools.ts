import type {CancellationToken, ExtensionContext, LanguageModelToolInvocationOptions} from "vscode"
import * as vscode from "vscode"

import type {ExtensionCtx} from "./extension-context"
import {config} from "./config"
import {checkMetabaseConnection} from "./metabase-client"

interface SetHostInput {
  host: string
}

interface SetApiKeyInput {
  apiKey?: string
}

interface RunTransformInput {
  name?: string
  entityId?: string
}

function maskApiKey(key: string): string {
  return `${"*".repeat(Math.max(0, key.length - 4))}${key.slice(-4)}`
}

function textResult(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)])
}

export function registerLmTools(ctx: ExtensionCtx, context: ExtensionContext): void {
  context.subscriptions.push(
    vscode.lm.registerTool<SetHostInput>("metastudio_setHost", {
      async invoke(
        options: LanguageModelToolInvocationOptions<SetHostInput>,
        _token: CancellationToken,
      ) {
        const {host} = options.input
        if (!host || typeof host !== "string") {
          return textResult('Error: "host" must be a non-empty string.')
        }
        try {
          await vscode.workspace
            .getConfiguration("metastudio")
            .update("host", host, true)
          ctx.connectionProvider.refresh()
          return textResult(`Metabase host set to: ${host}`)
        }
        catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return textResult(`Error setting host: ${message}`)
        }
      },
    }),
  )

  context.subscriptions.push(
    vscode.lm.registerTool<SetApiKeyInput>("metastudio_setApiKey", {
      async invoke(
        options: LanguageModelToolInvocationOptions<SetApiKeyInput>,
        _token: CancellationToken,
      ) {
        const {apiKey} = options.input

        if (apiKey !== undefined && apiKey !== null) {
          if (typeof apiKey !== "string" || apiKey.trim() === "") {
            return textResult('Error: "apiKey" must be a non-empty string when provided.')
          }
          try {
            await ctx.apiKey.set(apiKey)
            ctx.connectionProvider.refresh()
          }
          catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            return textResult(`Error storing API key: ${message}`)
          }
        }

        const current = ctx.apiKey.value
        if (!current) {
          return textResult("API key status: not set.")
        }
        const suffix = current.slice(-4)
        return textResult(`API key status: set (ends in ...${suffix}).`)
      },
    }),
  )

  context.subscriptions.push(
    vscode.lm.registerTool("metastudio_checkConnection", {
      async invoke(
        _options: LanguageModelToolInvocationOptions<Record<string, never>>,
        _token: CancellationToken,
      ) {
        const result = await checkMetabaseConnection(
          config.host,
          ctx.apiKey.value ?? undefined,
        )

        switch (result.status) {
          case "missing-host":
            return textResult(
              "Connection failed: Metabase host is not configured. Use metastudio_setHost to set it.",
            )
          case "missing-api-key":
            return textResult(
              "Connection failed: API key is not set. Use metastudio_setApiKey to set it.",
            )
          case "unauthorized":
            return textResult(
              "Connection failed: Authentication rejected (401/403). Check the API key.",
            )
          case "network-error":
            return textResult(`Connection failed: Network error — ${result.message}`)
          case "http-error":
            return textResult(`Connection failed: HTTP ${result.statusCode} ${result.statusText}`)
          case "success":
            return textResult(
              `Connection successful. Authenticated as ${result.firstName} ${result.lastName} (${result.email}).`,
            )
        }
      },
    }),
  )

  context.subscriptions.push(
    vscode.lm.registerTool<RunTransformInput>("metastudio_runTransform", {
      async invoke(
        options: LanguageModelToolInvocationOptions<RunTransformInput>,
        _token: CancellationToken,
      ) {
        const {name, entityId} = options.input

        if (!name && !entityId) {
          return textResult('Error: provide "name" or "entityId" to identify the transform.')
        }

        const transforms = ctx.contentProvider.transforms

        if (transforms.length === 0) {
          return textResult(
            "No transforms are loaded. Open a workspace folder containing a Metabase export first.",
          )
        }

        let node

        if (entityId) {
          node = transforms.find(t => t.entityId === entityId)
          if (!node) {
            return textResult(`Error: no transform found with entityId "${entityId}".`)
          }
        }
        else {
          const needle = name!.toLowerCase()
          const matches = transforms.filter(t => t.name.toLowerCase() === needle)
          if (matches.length === 0) {
            const available = transforms.map(t => `"${t.name}"`).join(", ")
            return textResult(
              `Error: no transform named "${name}". Available transforms: ${available}`,
            )
          }
          if (matches.length > 1) {
            const ids = matches.map(t => `"${t.entityId}"`).join(", ")
            return textResult(
              `Error: multiple transforms named "${name}" (entityIds: ${ids}). Use the "entityId" parameter to disambiguate.`,
            )
          }
          node = matches[0]
        }

        try {
          await vscode.commands.executeCommand("metastudio.runTransform", node)
          return textResult(`Transform "${node.name}" execution started.`)
        }
        catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return textResult(`Error executing transform "${node.name}": ${message}`)
        }
      },
    }),
  )

  context.subscriptions.push(
    vscode.lm.registerTool("metastudio_getApiKey", {
      async invoke(
        _options: LanguageModelToolInvocationOptions<Record<string, never>>,
        _token: CancellationToken,
      ) {
        const key = ctx.apiKey.value
        if (!key) {
          return textResult("API key: not set.")
        }
        return textResult(`API key: ${maskApiKey(key)}`)
      },
    }),
  )

  context.subscriptions.push(
    vscode.lm.registerTool("metastudio_getHost", {
      async invoke(
        _options: LanguageModelToolInvocationOptions<Record<string, never>>,
        _token: CancellationToken,
      ) {
        const host = config.host
        if (!host) {
          return textResult("Host: not configured.")
        }
        return textResult(`Host: ${host}`)
      },
    }),
  )
}
