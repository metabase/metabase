import { match } from "ts-pattern";

import type { TriggeredAlert } from "metabase-lib/transforms-inspector";
import type { InspectorLensMetadata } from "metabase-types/api";

import type { LensRef } from "./types";

export const convertLensToRef = (lens: InspectorLensMetadata): LensRef => ({
  id: lens.id,
  title: lens.display_name,
});

export const getAlertColor = (
  severity: TriggeredAlert["severity"],
): "error" | "warning" | "brand" =>
  match(severity)
    .with("error", () => "error" as const)
    .with("warning", () => "warning" as const)
    .otherwise(() => "brand" as const);
