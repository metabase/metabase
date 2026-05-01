import { t } from "ttag";

import { PaginationControls } from "metabase/common/components/PaginationControls";
import { usePagination } from "metabase/common/hooks/use-pagination";
import { Group, Stack } from "metabase/ui";
import { useListWorkspaceAccessKeyLogsQuery } from "metabase-enterprise/api";
import { TitleSection } from "metabase-enterprise/workspaces/common/components/TitleSection";
import type { WorkspaceId } from "metabase-types/api";

import { AccessKeyLogTable } from "./AccessKeyLogTable";

const PAGE_SIZE = 25;

type AccessKeyLogSectionProps = {
  workspaceId: WorkspaceId;
};

export function AccessKeyLogSection({ workspaceId }: AccessKeyLogSectionProps) {
  const { page, handleNextPage, handlePreviousPage } = usePagination();

  const { data: logsResponse } = useListWorkspaceAccessKeyLogsQuery({
    id: workspaceId,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const logs = logsResponse?.data ?? [];
  const total = logsResponse?.total ?? 0;

  return (
    <TitleSection
      label={t`Access key log`}
      description={t`Recent access key usage from public endpoints, newest first.`}
    >
      <Stack gap="md">
        <AccessKeyLogTable logs={logs} />
        {total > PAGE_SIZE && (
          <Group justify="flex-end">
            <PaginationControls
              page={page}
              pageSize={PAGE_SIZE}
              itemsLength={logs.length}
              total={total}
              showTotal
              onNextPage={handleNextPage}
              onPreviousPage={handlePreviousPage}
            />
          </Group>
        )}
      </Stack>
    </TitleSection>
  );
}
