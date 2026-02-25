import type { ExtensionCtx } from '../extension-context'
import { useCommand } from 'reactive-vscode'
import { Uri, window, workspace } from 'vscode'

import { stringify } from 'yaml'
import { loadExport } from '../export-loader'

/** Characters used in Metabase entity IDs (base63: A-Z a-z 0-9 _) */
const ENTITY_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_'

function generateEntityId(): string {
  const bytes = new Uint8Array(21)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => ENTITY_CHARS[b % ENTITY_CHARS.length]).join('')
}

function toSnakeCase(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

export function registerCreateTransformCommand(ctx: ExtensionCtx) {
  useCommand('metastudio.createSqlTransform', async () => {
    const folders = ctx.workspaceFolders.value
    if (!folders?.length) {
      window.showErrorMessage('No workspace folder is open.')
      return
    }

    // 1. Prompt for the transform name
    const name = await window.showInputBox({
      title: 'New SQL Transform',
      prompt: 'Enter a name for the transform',
      placeHolder: 'e.g. my_transform',
      validateInput: (value) => {
        if (!value.trim())
          return 'Name is required'
        return undefined
      },
    })
    if (!name)
      return

    // 2. Pick a database from the loaded catalog, or ask for a name
    const databases = ctx.panels.currentCatalog?.databases ?? []
    let databaseName: string | undefined

    if (databases.length > 0) {
      const items = databases.map(db => ({ label: db.name }))
      const pick = await window.showQuickPick(items, {
        title: 'Select Target Database',
        placeHolder: 'Which database should this transform use?',
      })
      if (!pick)
        return
      databaseName = pick.label
    }
    else {
      databaseName = await window.showInputBox({
        title: 'Target Database',
        prompt: 'Enter the database name for this transform',
        placeHolder: 'e.g. neondb',
        validateInput: (value) => {
          if (!value.trim())
            return 'Database name is required'
          return undefined
        },
      })
    }
    if (!databaseName)
      return

    // 3. Ask for the target schema (default: public)
    const schema = await window.showInputBox({
      title: 'Target Schema',
      prompt: 'Enter the target schema',
      value: 'public',
      placeHolder: 'public',
    })
    if (schema === undefined)
      return

    // 4. Generate the YAML content
    const entityId = generateEntityId()
    const snakeName = toSnakeCase(name)
    const now = new Date().toISOString()

    const transformData = {
      'collection_id': null,
      'created_at': now,
      'creator_id': null,
      'description': null,
      'entity_id': entityId,
      name,
      'owner_email': null,
      'owner_user_id': null,
      'source': {
        query: {
          database: databaseName,
          native: {
            query: `SELECT 1`,
          },
          type: 'native',
        },
        type: 'query',
      },
      'source_database_id': databaseName,
      'tags': [],
      'target': {
        database: databaseName,
        name: snakeName,
        schema: schema || 'public',
        type: 'table',
      },
      'serdes/meta': [
        {
          id: entityId,
          label: snakeName,
          model: 'Transform',
        },
      ],
    }

    const yamlContent = stringify(transformData, {
      lineWidth: 0,
      singleQuote: true,
    })

    // 5. Write the file into collections/transforms/
    const rootUri = folders[0].uri
    const transformsDir = Uri.joinPath(rootUri, 'collections', 'transforms')

    // Ensure the directory exists
    await workspace.fs.createDirectory(transformsDir)

    const fileName = `${entityId}_${snakeName}.yaml`
    const fileUri = Uri.joinPath(transformsDir, fileName)

    await workspace.fs.writeFile(fileUri, new TextEncoder().encode(yamlContent))

    // 6. Reload the export so the new transform appears in the tree
    await loadExport(ctx)

    // 7. Open the file
    const doc = await workspace.openTextDocument(fileUri)
    await window.showTextDocument(doc)

    window.showInformationMessage(`Created SQL transform "${name}"`)
  })
}
