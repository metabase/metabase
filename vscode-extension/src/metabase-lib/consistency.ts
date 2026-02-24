import type { CatalogGraph } from './catalog-graph'
import type { ContentGraph } from './content-graph'
import type { CollectionNode, ConsistencyIssue } from './types'

export function validateConsistency(
  catalog: CatalogGraph,
  content: ContentGraph,
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []

  // FK targets must resolve to existing fields
  for (const field of catalog.allFields) {
    if (!field.fkTargetFieldRef)
      continue

    const target = catalog.resolveFieldRef(field.fkTargetFieldRef)
    if (!target) {
      issues.push({
        severity: 'error',
        message: `Foreign key target not found: ${field.fkTargetFieldRef.join(' → ')}`,
        filePath: field.filePath,
        entityKind: 'field',
        referenceType: 'fk_target_field',
        reference: field.fkTargetFieldRef.join('/'),
      })
    }
    else if (!target.active) {
      issues.push({
        severity: 'warning',
        message: `Foreign key targets inactive field: ${field.fkTargetFieldRef.join(' → ')}`,
        filePath: field.filePath,
        entityKind: 'field',
        referenceType: 'fk_target_inactive',
        reference: field.fkTargetFieldRef.join('/'),
      })
    }
  }

  // Table collection_id references
  for (const table of catalog.allTables) {
    if (table.collectionId && !content.getCollection(table.collectionId)) {
      issues.push({
        severity: 'warning',
        message: `Table references non-existent collection: ${table.collectionId}`,
        filePath: table.filePath,
        entityKind: 'table',
        referenceType: 'collection_id',
        reference: table.collectionId,
      })
    }
  }

  // Card references
  for (const card of content.allCards) {
    if (card.databaseId && !catalog.getDatabase(card.databaseId)) {
      issues.push({
        severity: 'error',
        message: `Card references non-existent database: ${card.databaseId}`,
        filePath: card.filePath,
        entityKind: 'card',
        referenceType: 'database_id',
        reference: card.databaseId,
      })
    }

    if (card.tableRef && !catalog.resolveTableRef(card.tableRef)) {
      issues.push({
        severity: 'error',
        message: `Card references non-existent table: ${card.tableRef.join(' → ')}`,
        filePath: card.filePath,
        entityKind: 'card',
        referenceType: 'table_ref',
        reference: card.tableRef.join('/'),
      })
    }

    if (card.collectionId && !content.getCollection(card.collectionId)) {
      issues.push({
        severity: 'warning',
        message: `Card references non-existent collection: ${card.collectionId}`,
        filePath: card.filePath,
        entityKind: 'card',
        referenceType: 'collection_id',
        reference: card.collectionId,
      })
    }

    if (!card.collectionId) {
      issues.push({
        severity: 'warning',
        message: `Card has no collection assignment`,
        filePath: card.filePath,
        entityKind: 'card',
        referenceType: 'collection_id',
        reference: '(none)',
      })
    }

    if (card.sourceCardId && !content.getCard(card.sourceCardId)) {
      issues.push({
        severity: 'warning',
        message: `Card references non-existent source card: ${card.sourceCardId}`,
        filePath: card.filePath,
        entityKind: 'card',
        referenceType: 'source_card_id',
        reference: card.sourceCardId,
      })
    }
  }

  // Dashboard references
  for (const dashboard of content.allDashboards) {
    if (dashboard.collectionId && !content.getCollection(dashboard.collectionId)) {
      issues.push({
        severity: 'warning',
        message: `Dashboard references non-existent collection: ${dashboard.collectionId}`,
        filePath: dashboard.filePath,
        entityKind: 'dashboard',
        referenceType: 'collection_id',
        reference: dashboard.collectionId,
      })
    }

    if (!dashboard.collectionId) {
      issues.push({
        severity: 'warning',
        message: `Dashboard has no collection assignment`,
        filePath: dashboard.filePath,
        entityKind: 'dashboard',
        referenceType: 'collection_id',
        reference: '(none)',
      })
    }

    for (const dashcard of dashboard.dashcards) {
      if (dashcard.cardId && !content.getCard(dashcard.cardId)) {
        issues.push({
          severity: 'error',
          message: `Dashboard card references non-existent card: ${dashcard.cardId}`,
          filePath: dashboard.filePath,
          entityKind: 'dashboard',
          referenceType: 'dashcard_card_id',
          reference: dashcard.cardId,
        })
      }

      if (dashcard.actionId && !content.getAction(dashcard.actionId)) {
        issues.push({
          severity: 'error',
          message: `Dashboard card references non-existent action: ${dashcard.actionId}`,
          filePath: dashboard.filePath,
          entityKind: 'dashboard',
          referenceType: 'dashcard_action_id',
          reference: dashcard.actionId,
        })
      }

      if (dashcard.dashboardTabId) {
        const tabExists = dashboard.tabs.some(tab => tab.entityId === dashcard.dashboardTabId)
        if (!tabExists) {
          issues.push({
            severity: 'error',
            message: `Dashboard card references non-existent tab: ${dashcard.dashboardTabId}`,
            filePath: dashboard.filePath,
            entityKind: 'dashboard',
            referenceType: 'dashcard_tab_id',
            reference: dashcard.dashboardTabId,
          })
        }
      }
    }
  }

  // NativeQuerySnippet references
  for (const snippet of content.allSnippets) {
    if (snippet.collectionId && !content.getCollection(snippet.collectionId)) {
      issues.push({
        severity: 'warning',
        message: `Snippet references non-existent collection: ${snippet.collectionId}`,
        filePath: snippet.filePath,
        entityKind: 'native_query_snippet',
        referenceType: 'collection_id',
        reference: snippet.collectionId,
      })
    }
  }

  // Timeline references
  for (const timeline of content.allTimelines) {
    if (timeline.collectionId && !content.getCollection(timeline.collectionId)) {
      issues.push({
        severity: 'warning',
        message: `Timeline references non-existent collection: ${timeline.collectionId}`,
        filePath: timeline.filePath,
        entityKind: 'timeline',
        referenceType: 'collection_id',
        reference: timeline.collectionId,
      })
    }
  }

  // Action references
  for (const action of content.allActions) {
    if (action.modelId && !content.getCard(action.modelId)) {
      issues.push({
        severity: 'error',
        message: `Action references non-existent model card: ${action.modelId}`,
        filePath: action.filePath,
        entityKind: 'action',
        referenceType: 'model_id',
        reference: action.modelId,
      })
    }
  }

  // Document references
  for (const document of content.allDocuments) {
    if (document.collectionId && !content.getCollection(document.collectionId)) {
      issues.push({
        severity: 'warning',
        message: `Document references non-existent collection: ${document.collectionId}`,
        filePath: document.filePath,
        entityKind: 'document',
        referenceType: 'collection_id',
        reference: document.collectionId,
      })
    }
  }

  // Collection parent_id references
  for (const collection of content.allCollections) {
    if (collection.parentId && !content.getCollection(collection.parentId)) {
      issues.push({
        severity: 'error',
        message: `Collection references non-existent parent: ${collection.parentId}`,
        filePath: collection.filePath,
        entityKind: 'collection',
        referenceType: 'parent_id',
        reference: collection.parentId,
      })
    }
  }

  // Transform database references
  for (const transform of content.transforms) {
    if (transform.sourceDatabaseId && !catalog.getDatabase(transform.sourceDatabaseId)) {
      issues.push({
        severity: 'error',
        message: `Transform references non-existent source database: ${transform.sourceDatabaseId}`,
        filePath: transform.filePath,
        entityKind: 'transform',
        referenceType: 'source_database_id',
        reference: transform.sourceDatabaseId,
      })
    }
  }

  // Unreachable collections (circular parent_id or broken hierarchy)
  const reachable = new Set<string>()
  function markReachable(collection: CollectionNode) {
    reachable.add(collection.entityId)
    for (const child of collection.children) {
      if (!reachable.has(child.entityId)) {
        markReachable(child)
      }
    }
  }
  for (const root of content.rootCollections) {
    markReachable(root)
  }
  for (const collection of content.allCollections) {
    if (!reachable.has(collection.entityId)) {
      issues.push({
        severity: 'warning',
        message: `Collection is unreachable from any root (possible circular parent_id)`,
        filePath: collection.filePath,
        entityKind: 'collection',
        referenceType: 'hierarchy',
        reference: collection.parentId ?? '(none)',
      })
    }
  }

  return issues
}
