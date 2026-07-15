import type { VisualizationProps } from "metabase/visualizations/types";

import { ChoroplethMap } from "../../components/ChoroplethMap";
import { PinMap } from "../../components/PinMap";

import { isPinMapType } from "./utils";

// Renders the actual leaflet-backed map. This module (and everything it pulls
// in, including leaflet) is loaded lazily by Map.tsx so it stays out of the
// initial bundle.
export function MapRenderer(props: VisualizationProps) {
  const type = props.settings["map.type"];

  if (isPinMapType(type)) {
    return <PinMap {...props} />;
  }

  if (type === "region") {
    return <ChoroplethMap {...props} />;
  }

  return null;
}
