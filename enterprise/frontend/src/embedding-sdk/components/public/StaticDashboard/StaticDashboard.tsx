import type { EmbedDisplayParams } from "metabase/dashboard/types";

import { SdkDashboard, type SdkDashboardProps } from "../SdkDashboard";
/**
 * A lightweight dashboard component.
 *
 * @function
 * @category StaticDashboard
 */
const StaticDashboard = (props: SdkDashboardProps) => (
  <SdkDashboard mode="static" {...props} />
);

export { EmbedDisplayParams, StaticDashboard };
