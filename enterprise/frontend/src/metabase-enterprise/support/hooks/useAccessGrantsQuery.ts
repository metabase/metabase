import { usePagination } from "metabase/common/hooks/use-pagination";
import {
  useGetCurrentSupportAccessGrantQuery,
  useListSupportAccessGrantsQuery,
} from "metabase-enterprise/api";

const PAGE_SIZE = 10;

export const useAccessGrantsQuery = () => {
  const { page, handlePreviousPage, handleNextPage } = usePagination();
  const offset = PAGE_SIZE * page;

  const {
    data: listResponse,
    error,
    isFetching,
    isLoading,
  } = useListSupportAccessGrantsQuery({
    "include-revoked": true,
    offset,
    limit: PAGE_SIZE,
  });
  const { data: currentAccessGrant } = useGetCurrentSupportAccessGrantQuery();
  const { data: accessGrants = [], total } = listResponse || {};

  return {
    accessGrants,
    accessGrantsError: error,
    currentAccessGrant,
    isLoadingAccessGrants: isLoading,
    isFetchingAccessGrants: isFetching,
    total,
    pageSize: PAGE_SIZE,
    handlePreviousPage,
    handleNextPage,
    page,
  };
};
