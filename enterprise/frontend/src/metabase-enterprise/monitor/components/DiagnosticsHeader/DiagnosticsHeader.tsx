import { memo } from "react";

import {
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase/common/data-studio/components/PaneHeader";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { Stack } from "metabase/ui";

type DiagnosticsHeaderProps = {
  title: string;
  tabs: PaneHeaderTab[];
};

export const DiagnosticsHeader = memo(function DiagnosticsHeader({
  title,
  tabs,
}: DiagnosticsHeaderProps) {
  return (
    <Stack gap="md">
      <MonitorHeaderTitle>{title}</MonitorHeaderTitle>
      <PaneHeaderTabs tabs={tabs} />
    </Stack>
  );
});
