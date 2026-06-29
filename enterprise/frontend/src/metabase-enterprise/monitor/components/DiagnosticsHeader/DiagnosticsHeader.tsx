import { memo } from "react";

import {
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase/common/data-studio/components/PaneHeader";
import { Stack, Title } from "metabase/ui";

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
      <Title order={1}>{title}</Title>
      <PaneHeaderTabs tabs={tabs} />
    </Stack>
  );
});
