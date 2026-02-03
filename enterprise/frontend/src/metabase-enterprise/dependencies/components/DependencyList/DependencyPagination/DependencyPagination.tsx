import { PaginationControls } from "metabase/common/components/PaginationControls";
import { Flex } from "metabase/ui";

import { PAGE_SIZE } from "../constants";

type DependencyPaginationProps = {
  page: number;
  pageNodesCount: number;
  totalNodesCount: number;
  onPageChange: (page: number) => void;
};

export function DependencyPagination({
  page,
  pageNodesCount,
  totalNodesCount,
  onPageChange,
}: DependencyPaginationProps) {
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
