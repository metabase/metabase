import * as VisualizerCompat from "cljs/metabase.visualizer.js";
import type { Field, VisualizationDisplay } from "metabase-types/api";

// Import the compiled ClojureScript module
// @ts-expect-error - ClojureScript module

export interface CompatibilityCheckParams {
  currentDisplay: VisualizationDisplay | null;
  currentColumns: Field[];
  currentSettings: Record<string, any>;
  targetFields: Field[];
}

/**
 * Check if a target dataset is compatible with the current visualization.
 * This is a proof of concept implementation focusing on cartesian charts.
 */
export function isCompatible({
  currentDisplay,
  currentColumns,
  currentSettings,
  targetFields,
}: CompatibilityCheckParams): boolean {
  return VisualizerCompat.isCompatible(
    currentDisplay,
    currentColumns,
    currentSettings,
    targetFields,
  );
}

/**
 * Find which columns from target dataset are compatible with current visualization.
 * Returns a map of slot names to arrays of compatible fields.
 */
export function findCompatibleColumns({
  currentDisplay,
  currentColumns,
  currentSettings,
  targetFields,
}: CompatibilityCheckParams): Record<string, Field[]> {
  return VisualizerCompat.findCompatibleColumns(
    currentDisplay,
    currentColumns,
    currentSettings,
    targetFields,
  );
}
