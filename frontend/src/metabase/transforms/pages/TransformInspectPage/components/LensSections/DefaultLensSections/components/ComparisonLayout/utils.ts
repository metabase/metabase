import { interestingFields } from "metabase-lib/transforms-inspector";
import type {
  InspectorCard,
  TransformInspectSource,
  TransformInspectVisitedFields,
} from "metabase-types/api";

export type CardGroup = {
  groupId: string;
  inputCards: InspectorCard[];
  outputCards: InspectorCard[];
};

type CardGroupWithScore = CardGroup & {
  topScore: number;
};

const parseTitleParts = (title: string): { field: string; table?: string } => {
  const match = title.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (match) {
    return { field: match[1], table: match[2] };
  }
  return { field: title };
};

export function sortGroupsByScore({
  sources,
  visitedFields,
  groups,
}: {
  sources: TransformInspectSource[];
  visitedFields?: TransformInspectVisitedFields;
  groups: CardGroup[];
}): CardGroupWithScore[] {
  const allFields = sources.flatMap((s) => s.fields ?? []);
  const scoredFields = interestingFields(allFields, visitedFields);
  const groupsWithScore = groups.map((g) => {
    const topScore = g.inputCards.reduce((maxScore, card) => {
      const { field } = parseTitleParts(card.title);
      const score =
        scoredFields.find((f) => f.name === field)?.interestingness.score ?? 0;
      return Math.max(maxScore, score);
    }, 0);
    return { ...g, topScore };
  });

  return groupsWithScore.sort((a, b) => b.topScore - a.topScore);
}

function buildSourceOrderMap(sources: TransformInspectSource[]) {
  const map = new Map<number | undefined, number>();
  for (let i = 0; i < sources.length; i++) {
    map.set(sources[i].table_id, i);
  }
  return map;
}

export function groupCardsBySource(
  cards: InspectorCard[],
  sources: TransformInspectSource[],
): CardGroup[] {
  const sourceOrderMap = buildSourceOrderMap(sources);
  const groupMap = new Map<string, CardGroup>();

  for (const card of cards) {
    const metadata = card.metadata ?? {};
    const groupId = String(metadata.group_id ?? "default");
    const groupRole = metadata.group_role;

    if (!groupMap.has(groupId)) {
      groupMap.set(groupId, {
        groupId,
        inputCards: [],
        outputCards: [],
      });
    }

    const group = groupMap.get(groupId);
    if (group) {
      if (groupRole === "output") {
        group.outputCards.push(card);
      } else {
        group.inputCards.push(card);
      }
    }
  }

  for (const group of groupMap.values()) {
    group.inputCards.sort((a, b) => {
      const tableIdA = isNumber(a.metadata?.table_id)
        ? a.metadata?.table_id
        : undefined;
      const tableIdB = isNumber(b.metadata?.table_id)
        ? b.metadata?.table_id
        : undefined;
      const orderA = sourceOrderMap.get(tableIdA) ?? 999;
      const orderB = sourceOrderMap.get(tableIdB) ?? 999;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return getGroupOrder(a) - getGroupOrder(b);
    });

    group.outputCards.sort((a, b) => getGroupOrder(a) - getGroupOrder(b));
  }

  return Array.from(groupMap.values());
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getGroupOrder(card: { metadata?: { group_order?: unknown } }) {
  const order = card.metadata?.group_order;
  if (isNumber(order)) {
    return order;
  }
  return 0;
}
