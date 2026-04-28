import { t } from "ttag";

import { skipToken, useGetTableQueryMetadataQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Center, Stack } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import { FieldsSection } from "metabase-enterprise/dependencies/components/DependencyDiagnostics/DiagnosticsSidebar/FieldsSection";
import { InfoSection } from "metabase-enterprise/dependencies/components/DependencyDiagnostics/DiagnosticsSidebar/InfoSection";
import { LocationSection } from "metabase-enterprise/dependencies/components/DependencyDiagnostics/DiagnosticsSidebar/LocationSection";
import { SidebarResizableBox } from "metabase-enterprise/dependencies/components/DependencyDiagnostics/DiagnosticsSidebar/SidebarResizableBox";
import type { ConcreteTableId, TableRemapping } from "metabase-types/api";

import { MappedToSection } from "./MappedToSection";
import S from "./RemappingSidebar.module.css";
import { SidebarHeader } from "./SidebarHeader";
import { toTableDependencyNode } from "./utils";

type RemappingSidebarProps = {
  remapping: TableRemapping;
  containerWidth: number;
  onResizeStart: () => void;
  onResizeStop: () => void;
  onClose: () => void;
};

export function RemappingSidebar({
  remapping,
  containerWidth,
  onResizeStart,
  onResizeStop,
  onClose,
}: RemappingSidebarProps) {
  const tableId = remapping.from_table_id;

  const {
    data: table,
    isLoading,
    error,
  } = useGetTableQueryMetadataQuery(
    tableId != null ? { id: tableId } : skipToken,
  );

  const node = table != null ? toTableDependencyNode(table) : null;
  const isFetchingTable = tableId != null && (isLoading || error != null);

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
        data-testid="remapping-sidebar"
      >
        <Stack gap="lg">
          <SidebarHeader
            title={table?.display_name ?? remapping.from_table_name}
            link={
              table != null
                ? {
                    label: t`View metadata`,
                    url: Urls.dataStudioData({
                      databaseId: table.db_id,
                      schemaName: table.schema,
                      tableId: table.id as ConcreteTableId,
                    }),
                  }
                : undefined
            }
            dependencyGraphUrl={
              table != null
                ? Urls.dependencyGraph({
                    entry: {
                      id: table.id as ConcreteTableId,
                      type: "table",
                    },
                  })
                : undefined
            }
            onClose={onClose}
          />
          {node != null && (
            <>
              <LocationSection node={node} />
              <InfoSection node={node} />
            </>
          )}
          <MappedToSection remapping={remapping} />
        </Stack>
        {isFetchingTable ? (
          <Center>
            <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
          </Center>
        ) : (
          node != null && <FieldsSection node={node} />
        )}
      </Stack>
    </SidebarResizableBox>
  );
}
