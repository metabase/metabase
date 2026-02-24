import type { DependencyGraphResult, EntityRef } from "./metabase-lib/dependency-graph";
import type { ParsedEntities } from "./metabase-lib/parser";
import type {
  GraphViewNode,
  GraphViewEdge,
  GraphNodeModel,
  DependentsCount,
  GraphViewField,
} from "./shared-types";

function getCardModel(cardType: string): GraphNodeModel {
  switch (cardType) {
    case "model":
      return "model";
    case "metric":
      return "metric";
    default:
      return "question";
  }
}

function entityRefToModel(ref: EntityRef): GraphNodeModel {
  switch (ref.model) {
    case "Card":
      return "question";
    case "Table":
      return "table";
    case "Dashboard":
      return "dashboard";
    case "Transform":
      return "transform";
    case "Collection":
      return "collection";
    case "Segment":
      return "segment";
    case "Measure":
      return "measure";
    case "NativeQuerySnippet":
      return "snippet";
    case "Document":
      return "document";
    case "Action":
      return "action";
    case "Database":
      return "database";
    case "Field":
      return "field";
    default:
      return "question";
  }
}

function modelToGroupType(model: GraphNodeModel): keyof DependentsCount | null {
  switch (model) {
    case "question":
    case "model":
    case "metric":
    case "table":
    case "dashboard":
    case "transform":
    case "segment":
    case "measure":
    case "snippet":
    case "document":
      return model;
    default:
      return null;
  }
}

export function buildGraphViewData(
  graphResult: DependencyGraphResult,
  entities: ParsedEntities,
): { nodes: GraphViewNode[]; edges: GraphViewEdge[] } {
  const cardsByEntityId = new Map<string, (typeof entities.cards)[0]>();
  for (const card of entities.cards) {
    cardsByEntityId.set(card.entityId, card);
  }

  const tablesByKey = new Map<string, (typeof entities.tables)[0]>();
  for (const table of entities.tables) {
    const key = `${table.databaseName}/${table.schemaName || ""}/${table.name}`;
    tablesByKey.set(key, table);
  }

  const dashboardsByEntityId = new Map<
    string,
    (typeof entities.dashboards)[0]
  >();
  for (const dashboard of entities.dashboards) {
    dashboardsByEntityId.set(dashboard.entityId, dashboard);
  }

  const transformsByEntityId = new Map<
    string,
    (typeof entities.transforms)[0]
  >();
  for (const transform of entities.transforms) {
    transformsByEntityId.set(transform.entityId, transform);
  }

  const documentsByEntityId = new Map<
    string,
    (typeof entities.documents)[0]
  >();
  for (const document of entities.documents) {
    documentsByEntityId.set(document.entityId, document);
  }

  const snippetsByEntityId = new Map<string, (typeof entities.snippets)[0]>();
  for (const snippet of entities.snippets) {
    snippetsByEntityId.set(snippet.entityId, snippet);
  }

  const segmentsByEntityId = new Map<string, (typeof entities.segments)[0]>();
  for (const segment of entities.segments) {
    segmentsByEntityId.set(segment.entityId, segment);
  }

  const measuresByEntityId = new Map<string, (typeof entities.measures)[0]>();
  for (const measure of entities.measures) {
    measuresByEntityId.set(measure.entityId, measure);
  }

  const inboundEdges = new Map<string, Map<GraphNodeModel, number>>();
  const outboundCount = new Map<string, number>();
  const inboundCount = new Map<string, number>();

  const validEdges: GraphViewEdge[] = [];

  for (const edge of graphResult.edges) {
    const sourceKey = `${edge.source.model}:${edge.source.id}`;
    const targetSegment = edge.target[edge.target.length - 1];
    const targetKey = `${targetSegment.model}:${targetSegment.id}`;

    if (
      !graphResult.entities.has(
        edge.target.map((segment) => `${segment.model}:${segment.id}`).join("/"),
      )
    ) {
      continue;
    }

    validEdges.push({
      sourceKey,
      targetKey,
      referenceType: edge.referenceType,
    });

    outboundCount.set(sourceKey, (outboundCount.get(sourceKey) ?? 0) + 1);
    inboundCount.set(targetKey, (inboundCount.get(targetKey) ?? 0) + 1);

    const sourceRef = graphResult.entities.get(
      edge.source.model === edge.source.model
        ? `${edge.source.model}:${edge.source.id}`
        : "",
    );
    let sourceModel: GraphNodeModel = entityRefToModel(edge.source);

    const card = cardsByEntityId.get(edge.source.id);
    if (edge.source.model === "Card" && card) {
      sourceModel = getCardModel(card.cardType);
    }

    if (!inboundEdges.has(targetKey)) {
      inboundEdges.set(targetKey, new Map());
    }
    const groupType = modelToGroupType(sourceModel);
    if (groupType) {
      const targetGroups = inboundEdges.get(targetKey)!;
      targetGroups.set(sourceModel, (targetGroups.get(sourceModel) ?? 0) + 1);
    }
  }

  const nodes: GraphViewNode[] = [];
  const seenKeys = new Set<string>();

  for (const [pathKey, entityRef] of graphResult.entities) {
    const nodeKey = `${entityRef.model}:${entityRef.id}`;

    if (seenKeys.has(nodeKey)) continue;
    seenKeys.add(nodeKey);

    if (
      entityRef.model === "Database" ||
      entityRef.model === "Schema" ||
      entityRef.model === "Field"
    ) {
      continue;
    }

    let model: GraphNodeModel = entityRefToModel(entityRef);
    let description: string | null = null;
    let cardType: string | undefined;
    let queryType: string | undefined;
    let display: string | undefined;
    let createdAt: string | null | undefined;
    let fields: GraphViewField[] | undefined;

    if (entityRef.model === "Card") {
      const card = cardsByEntityId.get(entityRef.id);
      if (card) {
        model = getCardModel(card.cardType);
        description = card.description;
        cardType = card.cardType;
        queryType = card.queryType;
        display = card.display;
        createdAt = (card.raw.created_at as string) ?? null;

        const resultMetadata = card.raw.result_metadata;
        if (Array.isArray(resultMetadata)) {
          fields = resultMetadata.map(
            (column: Record<string, unknown>) => ({
              name:
                (column.display_name as string) ??
                (column.name as string) ??
                "Unknown",
              semanticType: (column.semantic_type as string) ?? null,
            }),
          );
        }
      }
    } else if (entityRef.model === "Table") {
      const table = findTableByName(entities.tables, entityRef.id);
      if (table) {
        description = table.description;
        fields = table.fields.map((field) => ({
          name: field.displayName || field.name,
          semanticType: field.semanticType,
        }));
      }
    } else if (entityRef.model === "Dashboard") {
      const dashboard = dashboardsByEntityId.get(entityRef.id);
      if (dashboard) {
        description = dashboard.description;
        createdAt = (dashboard.raw.created_at as string) ?? null;
      }
    } else if (entityRef.model === "Transform") {
      const transform = transformsByEntityId.get(entityRef.id);
      if (transform) {
        description = transform.description;
      }
    } else if (entityRef.model === "Document") {
      const document = documentsByEntityId.get(entityRef.id);
      if (document) {
        description = document.description;
      }
    } else if (entityRef.model === "NativeQuerySnippet") {
      const snippet = snippetsByEntityId.get(entityRef.id);
      if (snippet) {
        description = snippet.description;
      }
    } else if (entityRef.model === "Segment") {
      const segment = segmentsByEntityId.get(entityRef.id);
      if (segment) {
        description = segment.description;
      }
    } else if (entityRef.model === "Measure") {
      const measure = measuresByEntityId.get(entityRef.id);
      if (measure) {
        description = measure.description;
      }
    }

    const dependentsCount: DependentsCount = {};
    const groups = inboundEdges.get(nodeKey);
    if (groups) {
      for (const [groupModel, count] of groups) {
        const groupKey = modelToGroupType(groupModel);
        if (groupKey) {
          dependentsCount[groupKey] = count;
        }
      }
    }

    nodes.push({
      key: nodeKey,
      model,
      name: entityRef.name,
      description,
      filePath: entityRef.filePath,
      cardType,
      queryType,
      display,
      createdAt,
      dependentsCount,
      fields,
      incomingCount: inboundCount.get(nodeKey) ?? 0,
      outgoingCount: outboundCount.get(nodeKey) ?? 0,
    });
  }

  const nodeKeySet = new Set(nodes.map((node) => node.key));
  const filteredEdges = validEdges.filter(
    (edge) => nodeKeySet.has(edge.sourceKey) && nodeKeySet.has(edge.targetKey),
  );

  const deduplicatedEdges = Array.from(
    new Map(
      filteredEdges.map((edge) => [
        `${edge.sourceKey}->${edge.targetKey}`,
        edge,
      ]),
    ).values(),
  );

  return { nodes, edges: deduplicatedEdges };
}

function findTableByName(
  tables: ParsedEntities["tables"],
  name: string,
): (typeof tables)[0] | undefined {
  return tables.find((table) => table.name === name);
}
