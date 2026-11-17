import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import { PublishedTableBreadcrumbs } from "metabase/data-studio/common/components/PublishedTableBreadcrumbs";
import { SYSTEM_SEGMENT_ROLES } from "metabase/metadata/table-segments";
import { useParams } from "metabase/router";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";

import { SystemSegmentDetailPage } from "../DataModelSystemSegmentPage";

type PublishedTableSystemSegmentPageParams = {
  tableId: string;
  role: string;
};

/** PROTOTYPE: mocked. A published table's built-in segment, in the Library */
export function PublishedTableSystemSegmentPage() {
  const params = useParams<PublishedTableSystemSegmentPageParams>();
  const tableId = Urls.extractEntityId(params.tableId);
  const role = SYSTEM_SEGMENT_ROLES.find(
    (systemRole) => systemRole === params.role,
  );
  const { table, isLoading, error } = useLoadTableWithMetadata(tableId, {
    includeForeignTables: true,
  });

  if (isLoading || error || !table || !role) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper
          loading={isLoading}
          error={error ?? (role ? undefined : t`Segment not found`)}
        />
      </Center>
    );
  }

  return (
    <SystemSegmentDetailPage
      key={role}
      table={table}
      role={role}
      breadcrumbs={(segmentName) => (
        <PublishedTableBreadcrumbs
          table={table}
          entityName={segmentName}
          newEntityLabel={t`New segment`}
          tableListUrl={Urls.dataStudioTableSegments(table.id)}
        />
      )}
    />
  );
}
