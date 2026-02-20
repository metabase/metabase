import { interestingFields } from "metabase/transforms/lib/transforms-inspector";
import type {
  InspectorCard,
  InspectorSource,
  InspectorVisitedFields,
} from "metabase-types/api";

export type CardGroup = {
  groupId: string;
  inputCards: InspectorCard[];
  outputCards: InspectorCard[];
};

type CardGroupWithScore = CardGroup & {
  topScore: number;
};
export function sortGroupsByScore(
  groups: CardGroup[],
  sources: InspectorSource[],
  visitedFields?: InspectorVisitedFields,
): CardGroupWithScore[] {
  const allFields = sources.flatMap((s) => s.fields ?? []);
  const scoredFields = interestingFields(allFields, visitedFields);
  const groupsWithScore = groups.map((g) => {
    const topScore = g.inputCards.reduce((maxScore, card) => {
      const scoredField = scoredFields.find(
        (f) => f.id === card.metadata.field_id,
      );
      const score = scoredField?.interestingness.score ?? 0;
      return Math.max(maxScore, score);
    }, 0);
    return { ...g, topScore };
  });

  return groupsWithScore.sort((a, b) => b.topScore - a.topScore);
}

const buildTableOrdersInSources = (sources: InspectorSource[]) => {
  const map = new Map<number | undefined, number>();
  for (let i = 0; i < sources.length; i++) {
    map.set(sources[i].table_id, i);
  }
  return map;
};

const groupCardsByGroupId = (
  cards: InspectorCard[],
): Map<string, CardGroup> => {
  const groupMap = new Map<string, CardGroup>();
  for (const card of cards) {
    const metadata = card.metadata ?? {};
    const groupId = String(metadata.group_id ?? "default");
    const groupRole = metadata.group_role;
    const group = groupMap.get(groupId) ?? {
      groupId,
      inputCards: [],
      outputCards: [],
    };
    if (!groupMap.has(groupId)) {
      groupMap.set(groupId, group);
    }
    if (groupRole === "output") {
      group.outputCards.push(card);
    } else {
      group.inputCards.push(card);
    }
  }
  return groupMap;
};

export const groupCardsBySource = (
  cards: InspectorCard[],
  sources: InspectorSource[],
): CardGroup[] => {
  const cardsByGroupId = groupCardsByGroupId(cards);
  const tableOrdersInSources = buildTableOrdersInSources(sources);
  for (const group of cardsByGroupId.values()) {
    group.inputCards.sort((a, b) => {
      const orderA = getTableOrderInSources(a, tableOrdersInSources);
      const orderB = getTableOrderInSources(b, tableOrdersInSources);
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return getGroupOrder(a) - getGroupOrder(b);
    });

    group.outputCards.sort((a, b) => getGroupOrder(a) - getGroupOrder(b));
  }

  return Array.from(cardsByGroupId.values());
};

const getGroupOrder = (card: InspectorCard) => card.metadata?.group_order ?? 0;

const getTableOrderInSources = (
  card: InspectorCard,
  tableOrdersInSources: Map<number | undefined, number>,
): number =>
  tableOrdersInSources.get(card.metadata.table_id) ?? Number.POSITIVE_INFINITY;
