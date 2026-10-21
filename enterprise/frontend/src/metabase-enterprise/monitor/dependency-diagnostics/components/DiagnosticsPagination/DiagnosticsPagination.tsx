import { PaginationControls } from "metabase/common/components/PaginationControls";
import { PAGE_SIZE } from "metabase/monitor/constants";
import { Flex } from "metabase/ui";

type DiagnosticsPaginationProps = {
  page: number;
  pageNodesCount: number;
  totalNodesCount: number;
  onPageChange: (page: number) => void;
};

export function DiagnosticsPagination({
  page,
  pageNodesCount,
  totalNodesCount,
  onPageChange,
}: DiagnosticsPaginationProps) {
  return (
    <Flex justify="end">
      <PaginationControls
        page={page}
        pageSize={PAGE_SIZE}
        itemsLength={pageNodesCount}
        total={totalNodesCount}
        showTotal
        onPreviousPage={() => onPageChange(page - 1)}
        onNextPage={() => onPageChange(page + 1)}
      />
    </Flex>
  );
}
