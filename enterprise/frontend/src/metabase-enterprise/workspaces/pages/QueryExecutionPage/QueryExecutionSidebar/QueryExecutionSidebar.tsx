import { memo } from "react";
import { t } from "ttag";

import { Stack } from "metabase/ui";
import { SidebarResizableBox } from "metabase-enterprise/dependencies/components/DependencyDiagnostics/DiagnosticsSidebar/SidebarResizableBox";
import type { Database, QueryExecution } from "metabase-types/api";

import { InfoSection } from "./InfoSection";
import S from "./QueryExecutionSidebar.module.css";
import { QuerySection } from "./QuerySection";
import { SidebarHeader } from "./SidebarHeader";

type QueryExecutionSidebarProps = {
  item: QueryExecution;
  database: Database | undefined;
  containerWidth: number;
  onResizeStart: () => void;
  onResizeStop: () => void;
  onClose: () => void;
};

export const QueryExecutionSidebar = memo(function QueryExecutionSidebar({
  item,
  database,
  containerWidth,
  onResizeStart,
  onResizeStop,
  onClose,
}: QueryExecutionSidebarProps) {
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
        data-testid="query-execution-sidebar"
      >
        <SidebarHeader title={t`Query execution`} onClose={onClose} />
        <InfoSection item={item} database={database} />
        <QuerySection item={item} />
      </Stack>
    </SidebarResizableBox>
  );
});
