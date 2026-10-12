import type React from "react";

import { Box, type MantineStyleProps } from "metabase/ui";

import { SIDESHEET_HORIZONTAL_PADDING } from "./Sidesheet";
import Styles from "./sidesheet.module.css";

/** pass the removeBodyPadding prop to the Sidesheet component and wrap
 * your Tabs.Panels in this component and your padding will be all 👌
 */
export const SidesheetTabPanelContainer = (
  props: MantineStyleProps & { children: React.ReactNode },
) => (
  <Box
    className={Styles.OverflowAuto}
    px={SIDESHEET_HORIZONTAL_PADDING}
    py="xl"
    {...props}
  >
    <div>{props.children}</div>
  </Box>
);
