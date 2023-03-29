import type { WritebackAction, CardId } from "metabase-types/api";

type ModelId = CardId;

export type ModelActionMap = Record<ModelId, WritebackAction[]>;
