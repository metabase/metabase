import {
  TimelineSidebar,
  type TimelineSidebarProps,
} from "metabase/timelines/panel/components/TimelineSidebar";
import { Paper } from "metabase/ui";

import S from "./DisplayPanel.module.css";

const WIDTH = 360;

/**
 * Right of the chart, like the display panel: the query builder's Events
 * sidebar, to pick which timelines' events the chart shows and add new ones.
 */
export const EventsPanel = (props: TimelineSidebarProps) => (
  <Paper
    withBorder
    radius="md"
    className={S.root}
    w={WIDTH}
    mr="lg"
    style={{ overflowY: "auto" }}
  >
    <TimelineSidebar {...props} />
  </Paper>
);
