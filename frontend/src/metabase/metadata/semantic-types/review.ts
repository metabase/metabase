import _ from "underscore";

import { getRawTableFieldId } from "metabase/metadata/utils/field";
import type { Field } from "metabase-types/api";

import {
  FACET_KEYS,
  type FieldTypeGroup,
  getFieldTypeGroup,
} from "./field-types";
import type {
  ResolvedFieldType,
  ResolvedSubject,
  SemanticTable,
} from "./semantic-types";

export type Suggestion =
  | {
      kind: "subject";
      key: string;
      table: SemanticTable;
      resolved: ResolvedSubject;
    }
  | {
      kind: "field";
      key: string;
      table: SemanticTable;
      field: Field;
      resolved: ResolvedFieldType;
    };

const GROUP_PRIORITY: FieldTypeGroup[] = [
  "keys",
  "dates",
  "amounts",
  "categories",
  "text",
  "location",
  "structure",
];

function getImpactRank(suggestion: Suggestion): number {
  if (suggestion.kind === "subject") {
    return 0;
  }
  const { semanticType, facets } = suggestion.resolved;
  const types = [
    semanticType,
    ...FACET_KEYS.map((facetKey) => facets[facetKey]),
  ].filter((type): type is string => type != null);
  const ranks = types.flatMap((type) => {
    const group = getFieldTypeGroup(type);
    return group ? [GROUP_PRIORITY.indexOf(group) + 1] : [];
  });
  return ranks.length > 0 ? Math.min(...ranks) : GROUP_PRIORITY.length + 1;
}

function needsReview(suggestion: Suggestion): boolean {
  return suggestion.resolved.needsReview;
}

export function getSuggestions(
  tables: {
    table: SemanticTable;
    subject: ResolvedSubject;
    fieldTypes: Map<number, ResolvedFieldType>;
  }[],
): Suggestion[] {
  const suggestions = tables.flatMap(
    ({ table, subject, fieldTypes }): Suggestion[] => {
      const subjectSuggestion: Suggestion[] = subject.hasSuggestion
        ? [
            {
              kind: "subject",
              key: `table:${table.db_id}:${table.id}`,
              table,
              resolved: subject,
            },
          ]
        : [];
      const fieldSuggestions = _.sortBy(table.fields ?? [], "position").flatMap(
        (field): Suggestion[] => {
          const resolved = fieldTypes.get(getRawTableFieldId(field));
          return resolved?.hasSuggestion
            ? [
                {
                  kind: "field",
                  key: `field:${getRawTableFieldId(field)}`,
                  table,
                  field,
                  resolved,
                },
              ]
            : [];
        },
      );
      return [...subjectSuggestion, ...fieldSuggestions];
    },
  );
  const getSortKey = (suggestion: Suggestion) => [
    needsReview(suggestion) ? 0 : 1,
    getImpactRank(suggestion),
  ];
  return suggestions
    .map((suggestion, index) => ({ suggestion, index }))
    .sort((a, b) => {
      const [aReview, aImpact] = getSortKey(a.suggestion);
      const [bReview, bImpact] = getSortKey(b.suggestion);
      return aReview - bReview || aImpact - bImpact || a.index - b.index;
    })
    .map(({ suggestion }) => suggestion);
}
