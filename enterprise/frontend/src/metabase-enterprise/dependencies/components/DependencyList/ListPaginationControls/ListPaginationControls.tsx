import { PaginationControls } from "metabase/common/components/PaginationControls";
import { Flex } from "metabase/ui";

import { PAGE_SIZE } from "../constants";

type ListPaginationControlsProps = {
  page: number;
  pageNodesCount: number;
  totalNodesCount: number;
  onPageChange: (page: number) => void;
};

export function ListPaginationControls({
  page,
  pageNodesCount,
  totalNodesCount,
  onPageChange,
}: ListPaginationControlsProps) {
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
