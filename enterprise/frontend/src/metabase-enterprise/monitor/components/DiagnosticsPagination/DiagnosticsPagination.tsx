import { PaginationControls } from "metabase/common/components/PaginationControls";
import { Flex } from "metabase/ui";

type DiagnosticsPaginationProps = {
  page: number;
  pageSize: number;
  pageItemCount: number;
  totalCount: number;
  onPageChange: (page: number) => void;
};

export function DiagnosticsPagination({
  page,
  pageSize,
  pageItemCount,
  totalCount,
  onPageChange,
}: DiagnosticsPaginationProps) {
  return (
    <Flex justify="end">
      <PaginationControls
        page={page}
        pageSize={pageSize}
        itemsLength={pageItemCount}
        total={totalCount}
        showTotal
        onPreviousPage={() => onPageChange(page - 1)}
        onNextPage={() => onPageChange(page + 1)}
      />
    </Flex>
  );
}
