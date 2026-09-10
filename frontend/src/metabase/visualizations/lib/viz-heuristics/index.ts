export * from "./types";
export {
  VIZ_HEURISTICS,
  DEFAULT_VIZ_HEURISTIC_ID,
  getVizHeuristic,
} from "./registry";
export { getContractViolations } from "./contract";
export {
  type VizReport,
  VizHeuristicProvider,
  useVizHeuristic,
  useResolvedDisplay,
} from "./VizHeuristicContext";
export {
  type DimensionDisplayType,
  AVAILABLE_DISPLAYS_BY_DIMENSION_TYPE,
  DEFAULT_DISPLAY_BY_DIMENSION_TYPE,
  isAllowedDisplay,
} from "./shared";
