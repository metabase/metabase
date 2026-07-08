import * as Yup from "yup";

import type {
  CardDisplayType,
  DatasetQuery,
  MetabotCodeEdit,
  MetabotTodoItem,
  SuggestedTransform,
} from "metabase-types/api";

export const toolInputAvailableSchema = Yup.object({
  toolCallId: Yup.string().required(),
  toolName: Yup.string().required(),
  input: Yup.mixed().defined(),
});

export const toolOutputAvailableSchema = Yup.object({
  toolCallId: Yup.string().required(),
  output: Yup.mixed().defined(),
});

export const toolOutputErrorSchema = Yup.object({
  toolCallId: Yup.string().required(),
  errorText: Yup.string().required(),
});

export const dataEventSchema = Yup.object({
  type: Yup.string()
    .required()
    .test("data-prefix", 'type must start with "data-"', (val) =>
      val ? val.startsWith("data-") : false,
    ),
  data: Yup.mixed().required(),
});

export const knownDataPartTypes = [
  "data-navigate_to",
  "data-state",
  "data-todo_list",
  "data-code_edit",
  "data-transform_suggestion",
  "data-generated_entity",
  "data-entity_saved",
  "data-adhoc_viz",
  "data-static_viz",
] as const satisfies readonly KnownDataPart["type"][];

export type AdhocVizValue = {
  query: unknown;
  link: string;
  title?: string;
  display?: string;
};

export type StaticVizValue = {
  entity_id: number;
};

export type GeneratedQuery = {
  id: string;
  query: DatasetQuery;
};

export type GeneratedCard = {
  type: "card";
  id: string;
  title: string;
  description?: string;
  query: GeneratedQuery;
  display?: CardDisplayType;
};

export type GeneratedEntity = GeneratedCard;

export type SavedEntityLocation =
  | { type: "collection"; id: number | null }
  | { type: "dashboard"; id: number };

export type EntitySavedValue = {
  entity_id: string;
  card_id: number;
  location: SavedEntityLocation;
};

export type KnownDataPart =
  | { type: "data-navigate_to"; data: string }
  | { type: "data-state"; data: Record<string, unknown> }
  | { type: "data-todo_list"; data: MetabotTodoItem[] }
  | { type: "data-transform_suggestion"; data: SuggestedTransform }
  | { type: "data-code_edit"; data: MetabotCodeEdit }
  | { type: "data-generated_entity"; data: GeneratedEntity }
  | { type: "data-entity_saved"; data: EntitySavedValue }
  | { type: "data-adhoc_viz"; data: AdhocVizValue }
  | { type: "data-static_viz"; data: StaticVizValue };

export const isKnownDataPart = (part: {
  type: string;
  data: unknown;
}): part is KnownDataPart =>
  // Unjustified type cast. FIXME
  (knownDataPartTypes as readonly string[]).includes(part.type);
