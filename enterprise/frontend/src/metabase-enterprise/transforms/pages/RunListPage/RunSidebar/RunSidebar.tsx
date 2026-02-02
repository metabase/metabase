import { memo } from "react";

import { Stack } from "metabase/ui";
import type { TransformRun } from "metabase-types/api";

import { CancelationSection } from "./CancelationSection";
import { ErrorSection } from "./ErrorSection";
import { InfoSection } from "./InfoSection";
import { LocationSection } from "./LocationSection";
import S from "./RunSidebar.module.css";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarResizableBox } from "./SidebarResizableBox";

type RunSidebarProps = {
  run: TransformRun;
  containerWidth: number;
  onResizeStart: () => void;
  onResizeStop: () => void;
  onClose: () => void;
};

export const RunSidebar = memo(function RunSidebar({
  run,
  containerWidth,
  onResizeStart,
  onResizeStop,
  onClose,
}: RunSidebarProps) {
  return (
    <SidebarResizableBox
      containerWidth={containerWidth}
      onResizeStart={onResizeStart}
      onResizeStop={onResizeStop}
    >
      <Stack
        className={S.sidebar}
        p="lg"
        gap="xl"
        bg="background-primary"
        data-testid="run-list-sidebar"
      >
        <Stack gap="lg">
          <SidebarHeader run={run} onClose={onClose} />
          <LocationSection run={run} />
          <InfoSection run={run} />
        </Stack>
        {run.message != null && <ErrorSection run={run} />}
        {run.status === "started" && <CancelationSection run={run} />}
      </Stack>
    </SidebarResizableBox>
  );
});
