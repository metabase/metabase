import { memo } from "react";

import { Stack } from "metabase/ui";
import { SidebarResizableBox } from "metabase-enterprise/dependencies/components/DependencyDiagnostics/DiagnosticsSidebar/SidebarResizableBox";
import type { Card } from "metabase-types/api";

import { ActionSection } from "./ActionSection";
import { InfoSection } from "./InfoSection";
import { LocationSection } from "./LocationSection";
import S from "./ModelSidebar.module.css";
import { SidebarHeader } from "./SidebarHeader";

type ModelSidebarProps = {
  card: Card;
  containerWidth: number;
  onResizeStart: () => void;
  onResizeStop: () => void;
  onClose: () => void;
};

export const ModelSidebar = memo(function ModelSidebar({
  card,
  containerWidth,
  onResizeStart,
  onResizeStop,
  onClose,
}: ModelSidebarProps) {
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
        data-testid="model-sidebar"
      >
        <Stack gap="lg">
          <SidebarHeader card={card} onClose={onClose} />
          <LocationSection card={card} />
          <InfoSection card={card} />
        </Stack>
        <ActionSection card={card} />
      </Stack>
    </SidebarResizableBox>
  );
});
