import {watch} from "@reactive-vscode/reactivity"
import {useFileSystemWatcher} from "reactive-vscode"
import {commands, Uri, workspace} from "vscode"

import type {ExtensionCtx} from "./extension-context"
import {loadMetabaseExport} from "./metabase-lib"

const CONFIG_FILENAME = "metabase.config.json"

export function registerExportLoader(ctx: ExtensionCtx) {
  async function checkConfigExists() {
    const folders = ctx.workspaceFolders.value
    if (!folders?.length) {
      ctx.configExists.value = false
      return
    }

    const configUri = Uri.joinPath(folders[0].uri, CONFIG_FILENAME)
    try {
      await workspace.fs.stat(configUri)
      ctx.configExists.value = true
    } catch {
      ctx.configExists.value = false
    }
  }

  checkConfigExists()

  useFileSystemWatcher(`**/${CONFIG_FILENAME}`, {
    onDidCreate: checkConfigExists,
    onDidDelete: checkConfigExists,
  })

  watch(ctx.configExists, (value) => {
    commands.executeCommand("setContext", "metabase.configExists", value)
    loadExport(ctx)
  })
}

export async function loadExport(ctx: ExtensionCtx) {
  const folders = ctx.workspaceFolders.value
  if (!ctx.configExists.value || !folders?.length) {
    ctx.catalogProvider.setGraph(null)
    ctx.contentProvider.setGraph(null)
    return
  }

  try {
    const rootPath = folders[0].uri.fsPath
    const {catalog, content} = await loadMetabaseExport(rootPath)
    ctx.panels.currentCatalog = catalog
    ctx.catalogProvider.setGraph(catalog)
    ctx.contentProvider.setGraph(content)
  } catch {
    ctx.panels.currentCatalog = null
    ctx.catalogProvider.setGraph(null)
    ctx.contentProvider.setGraph(null)
  }
}
