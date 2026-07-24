import { PaginationControls } from "metabase/common/components/PaginationControls";
import { Flex } from "metabase/ui";

import { PAGE_SIZE } from "../constants";

type DiagnosticsPaginationProps = {
  page: number;
  pageItemCount: number;
  totalCount: number;
  onPageChange: (page: number) => void;
};

export function DiagnosticsPagination({
  page,
  pageItemCount,
  totalCount,
  onPageChange,
}: DiagnosticsPaginationProps) {
  return (
    <Flex justify="end">
      <PaginationControls
        page={page}
        pageSize={PAGE_SIZE}
        itemsLength={pageItemCount}
        total={totalCount}
        showTotal
        onPreviousPage={() => onPageChange(page - 1)}
        onNextPage={() => onPageChange(page + 1)}
      />
    </Flex>
  );
}
