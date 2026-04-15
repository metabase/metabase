import { PaginationControls } from "metabase/common/components/PaginationControls";
import { Group } from "metabase/ui";

import { PAGE_SIZE } from "../constants";

type RunPaginationProps = {
  page: number;
  itemsLength: number;
  totalCount: number;
  onPageChange: (page: number) => void;
};

export function RunPagination({
  page,
  itemsLength,
  totalCount,
  onPageChange,
}: RunPaginationProps) {
  const handlePreviousPage = () => {
    onPageChange(page - 1);
  };

  const handleNextPage = () => {
    onPageChange(page + 1);
  };

  if (totalCount < PAGE_SIZE) {
    return null;
  }

  return (
    <Group justify="end">
      <PaginationControls
        page={page}
        pageSize={PAGE_SIZE}
        itemsLength={itemsLength}
        total={totalCount}
        showTotal
        onPreviousPage={handlePreviousPage}
        onNextPage={handleNextPage}
      />
    </Group>
  );
}
