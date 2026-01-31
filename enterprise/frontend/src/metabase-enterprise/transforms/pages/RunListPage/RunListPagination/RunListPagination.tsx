import { PaginationControls } from "metabase/common/components/PaginationControls";
import type * as Urls from "metabase/lib/urls";
import { Group } from "metabase/ui";

import { PAGE_SIZE } from "../constants";

type RunListPaginationProps = {
  params: Urls.TransformRunListParams;
  page: number;
  itemsLength: number;
  totalCount: number;
  onParamsChange: (params: Urls.TransformRunListParams) => void;
};

export function RunListPagination({
  params,
  page,
  itemsLength,
  totalCount,
  onParamsChange,
}: RunListPaginationProps) {
  const handlePreviousPage = () => {
    onParamsChange({ ...params, page: page - 1 });
  };

  const handleNextPage = () => {
    onParamsChange({ ...params, page: page + 1 });
  };

  if (totalCount < PAGE_SIZE) {
    return null;
  }

  return (
    <Group mt="lg" justify="end">
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
