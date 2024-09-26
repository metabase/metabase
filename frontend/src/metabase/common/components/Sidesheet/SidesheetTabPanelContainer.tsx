import type React from "react";

import { Box, type MantineStyleSystemProps } from "metabase/ui";

import Styles from "./sidesheet.module.css";

/** pass the removeBodyPadding prop to the Sidesheet component and wrap
 * your Tabs.Panels in this component and your padding will be all 👌
 */
export const SidesheetTabPanelContainer = (
  props: MantineStyleSystemProps & { children: React.ReactNode },
) => (
  <Box className={Styles.OverflowAuto} p="xl" {...props}>
    <div>{props.children}</div>
  </Box>
);
