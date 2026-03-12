import { memo } from "react";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { Stack } from "metabase/ui";
import { SidebarResizableBox } from "metabase-enterprise/dependencies/components/DependencyDiagnostics/DiagnosticsSidebar/SidebarResizableBox";
import type { SearchResult } from "metabase-types/api";

import { ActionSection } from "./ActionSection";
import { InfoSection } from "./InfoSection";
import { LocationSection } from "./LocationSection";
import S from "./ModelSidebar.module.css";
import { SidebarHeader } from "./SidebarHeader";

type ModelSidebarProps = {
  result: SearchResult;
  containerWidth: number;
  onResizeStart: () => void;
  onResizeStop: () => void;
  onClose: () => void;
};

export const ModelSidebar = memo(function ModelSidebar({
  result,
  containerWidth,
  onResizeStart,
  onResizeStop,
  onClose,
}: ModelSidebarProps) {
  const { data: database } = useGetDatabaseQuery(
    result.database_id != null ? { id: result.database_id } : skipToken,
  );

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
          <SidebarHeader result={result} onClose={onClose} />
          <LocationSection result={result} database={database} />
          <InfoSection result={result} />
        </Stack>
        <ActionSection result={result} database={database} />
      </Stack>
    </SidebarResizableBox>
  );
});
