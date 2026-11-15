import type { Sorting } from "metabase/utils/sorting";

export type GlossaryField = "term" | "definition";

export type GlossarySort = Sorting<GlossaryField>;
