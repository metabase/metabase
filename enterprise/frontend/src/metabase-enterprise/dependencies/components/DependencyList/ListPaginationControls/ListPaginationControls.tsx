import { PaginationControls } from "metabase/common/components/PaginationControls";
import type * as Urls from "metabase/lib/urls";
import { Flex } from "metabase/ui";

import { PAGE_SIZE } from "../constants";

type ListPaginationControlsProps = {
  params: Urls.DependencyListParams;
  pageNodesCount: number;
  totalNodesCount: number;
  onParamsChange: (params: Urls.DependencyListParams) => void;
};

export function ListPaginationControls({
  params,
  pageNodesCount,
  totalNodesCount,
  onParamsChange,
}: ListPaginationControlsProps) {
  const { page = 0 } = params;

  return (
    <Flex justify="end">
      <PaginationControls
        page={page}
        pageSize={PAGE_SIZE}
        itemsLength={pageNodesCount}
        total={totalNodesCount}
        showTotal
        onPreviousPage={() => onParamsChange({ ...params, page: page - 1 })}
        onNextPage={() => onParamsChange({ ...params, page: page + 1 })}
      />
    </Flex>
  );
}
