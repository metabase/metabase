import { createContext } from "react";

export const CompactReadingContext = createContext(false);

/**
 * What happens to a filter on the summary picked in the middle of the
 * expression: it stays at the caret and a group mixing it with row filters
 * is an error, or it is carried to the end and AND-ed on.
 */
export type SummaryPlacement = "caret" | "end";

export const SummaryPlacementContext = createContext<SummaryPlacement>("caret");
