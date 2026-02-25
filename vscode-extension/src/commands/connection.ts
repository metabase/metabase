import {useCommand} from "reactive-vscode"
import {commands, window, workspace} from "vscode"

import type {ExtensionCtx} from "../extension-context"
import {config} from "../config"
import {checkMetabaseConnection} from "../metabase-client"

export function registerConnectionCommands(ctx: ExtensionCtx) {
  function updateHostConfigured() {
    commands.executeCommand(
      "setContext",
      "metastudio.hostConfigured",
      !!config.host,
    )
  }

  updateHostConfigured()

  workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("metastudio.host")) {
      updateHostConfigured()
    }
  })

  useCommand("metastudio.setHost", async () => {
    const current = config.host ?? ""
    const value = await window.showInputBox({
      prompt: "Enter your Metabase instance URL",
      placeHolder: "https://my-metabase.example.com",
      value: current,
    })
    if (value !== undefined) {
      await workspace
        .getConfiguration("metastudio")
        .update("host", value, true)
      ctx.connectionProvider.refresh()
    }
  })

  useCommand("metastudio.setApiKey", async () => {
    const value = await window.showInputBox({
      prompt: "Enter your Metabase API key",
      password: true,
      ignoreFocusOut: true,
    })
    if (value !== undefined) {
      await ctx.apiKey.set(value)
      ctx.connectionProvider.refresh()
      window.showInformationMessage("API key saved securely.")
    }
  })

  useCommand("metastudio.clearCredentials", async () => {
    await workspace.getConfiguration("metastudio").update("host", "", true)
    await ctx.apiKey.set("")
    ctx.connectionProvider.refresh()
  })

  useCommand("metastudio.checkConnection", async () => {
    const result = await checkMetabaseConnection(
      config.host,
      ctx.apiKey.value ?? undefined,
    )

    switch (result.status) {
      case "missing-host":
        window.showErrorMessage(
          'Metabase host is not configured. Set it in Settings under "metastudio.host".',
        )
        break
      case "missing-api-key": {
        const action = await window.showWarningMessage(
          "No API key set.",
          "Set API Key",
        )
        if (action === "Set API Key") {
          commands.executeCommand("metastudio.setApiKey")
        }
        break
      }
      case "unauthorized":
        window.showErrorMessage("Authentication failed. Check your API key.")
        break
      case "network-error":
        window.showErrorMessage(`Could not reach Metabase: ${result.message}`)
        break
      case "http-error":
        window.showErrorMessage(
          `Metabase returned HTTP ${result.statusCode}: ${result.statusText}`,
        )
        break
      case "success":
        window.showInformationMessage(`Metabase connection successful`)
        break
    }
  })
}
