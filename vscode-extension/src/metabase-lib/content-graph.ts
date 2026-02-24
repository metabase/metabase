import type { ParsedEntities } from './parser'
import type {
  ActionNode,
  CardNode,
  CollectionNode,
  ContentNode,
  DashboardNode,
  DocumentNode,
  NativeQuerySnippetNode,
  TimelineNode,
  TransformNode,
} from './types'

export class ContentGraph {
  private collectionIndex = new Map<string, CollectionNode>()
  private cardIndex = new Map<string, CardNode>()
  private dashboardIndex = new Map<string, DashboardNode>()
  private snippetIndex = new Map<string, NativeQuerySnippetNode>()
  private timelineIndex = new Map<string, TimelineNode>()
  private actionIndex = new Map<string, ActionNode>()
  private documentIndex = new Map<string, DocumentNode>()
  private transformIndex = new Map<string, TransformNode>()

  get rootCollections(): CollectionNode[] {
    return [...this.collectionIndex.values()].filter(collection => collection.parentId === null)
  }

  get allCollections(): CollectionNode[] {
    return [...this.collectionIndex.values()]
  }

  get allCards(): CardNode[] {
    return [...this.cardIndex.values()]
  }

  get allDashboards(): DashboardNode[] {
    return [...this.dashboardIndex.values()]
  }

  get allSnippets(): NativeQuerySnippetNode[] {
    return [...this.snippetIndex.values()]
  }

  get allTimelines(): TimelineNode[] {
    return [...this.timelineIndex.values()]
  }

  get allActions(): ActionNode[] {
    return [...this.actionIndex.values()]
  }

  get allDocuments(): DocumentNode[] {
    return [...this.documentIndex.values()]
  }

  get transforms(): TransformNode[] {
    return [...this.transformIndex.values()]
  }

  getCollection(entityId: string): CollectionNode | undefined {
    return this.collectionIndex.get(entityId)
  }

  getCard(entityId: string): CardNode | undefined {
    return this.cardIndex.get(entityId)
  }

  getDashboard(entityId: string): DashboardNode | undefined {
    return this.dashboardIndex.get(entityId)
  }

  getSnippet(entityId: string): NativeQuerySnippetNode | undefined {
    return this.snippetIndex.get(entityId)
  }

  getTimeline(entityId: string): TimelineNode | undefined {
    return this.timelineIndex.get(entityId)
  }

  getAction(entityId: string): ActionNode | undefined {
    return this.actionIndex.get(entityId)
  }

  getDocument(entityId: string): DocumentNode | undefined {
    return this.documentIndex.get(entityId)
  }

  getTransform(entityId: string): TransformNode | undefined {
    return this.transformIndex.get(entityId)
  }

  getRoots(): ContentNode[] {
    return [...this.rootCollections, ...this.transforms]
  }

  getChildren(node: ContentNode): ContentNode[] {
    switch (node.kind) {
      case 'collection':
        return [
          ...node.children,
          ...node.cards,
          ...node.dashboards,
          ...node.snippets,
          ...node.timelines,
          ...node.documents,
        ]
      default:
        return []
    }
  }

  static build(entities: ParsedEntities): ContentGraph {
    const graph = new ContentGraph()

    for (const collection of entities.collections) {
      graph.collectionIndex.set(collection.entityId, collection)
    }

    for (const collection of entities.collections) {
      if (collection.parentId) {
        graph.collectionIndex.get(collection.parentId)?.children.push(collection)
      }
    }

    for (const card of entities.cards) {
      graph.cardIndex.set(card.entityId, card)
      if (card.collectionId) {
        graph.collectionIndex.get(card.collectionId)?.cards.push(card)
      }
    }

    for (const dashboard of entities.dashboards) {
      graph.dashboardIndex.set(dashboard.entityId, dashboard)
      if (dashboard.collectionId) {
        graph.collectionIndex.get(dashboard.collectionId)?.dashboards.push(dashboard)
      }
    }

    for (const snippet of entities.snippets) {
      graph.snippetIndex.set(snippet.entityId, snippet)
      if (snippet.collectionId) {
        graph.collectionIndex.get(snippet.collectionId)?.snippets.push(snippet)
      }
    }

    for (const timeline of entities.timelines) {
      graph.timelineIndex.set(timeline.entityId, timeline)
      if (timeline.collectionId) {
        graph.collectionIndex.get(timeline.collectionId)?.timelines.push(timeline)
      }
    }

    for (const action of entities.actions) {
      graph.actionIndex.set(action.entityId, action)
    }

    for (const document of entities.documents) {
      graph.documentIndex.set(document.entityId, document)
      if (document.collectionId) {
        graph.collectionIndex.get(document.collectionId)?.documents.push(document)
      }
    }

    for (const transform of entities.transforms) {
      graph.transformIndex.set(transform.entityId, transform)
    }

    for (const collection of graph.collectionIndex.values()) {
      collection.children.sort((childA, childB) => childA.name.localeCompare(childB.name))
      collection.cards.sort((cardA, cardB) => cardA.name.localeCompare(cardB.name))
      collection.dashboards.sort((dashA, dashB) => dashA.name.localeCompare(dashB.name))
      collection.snippets.sort((snippetA, snippetB) => snippetA.name.localeCompare(snippetB.name))
      collection.timelines.sort((timelineA, timelineB) => timelineA.name.localeCompare(timelineB.name))
      collection.documents.sort((documentA, documentB) => documentA.name.localeCompare(documentB.name))
    }

    return graph
  }
}
