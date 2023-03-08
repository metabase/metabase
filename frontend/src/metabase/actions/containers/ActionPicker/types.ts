import type { WritebackAction } from "metabase-types/api";

type ModelId = number;

export type ModelActionMap = Record<ModelId, WritebackAction[]>;
