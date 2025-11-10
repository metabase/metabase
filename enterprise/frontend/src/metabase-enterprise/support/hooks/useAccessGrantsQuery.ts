import { usePagination } from "metabase/common/hooks/use-pagination";
import {
  useGetCurrentSupportAccessGrantQuery,
  useListSupportAccessGrantsQuery,
} from "metabase-enterprise/api";

export const useAccessGrantsQuery = () => {
  const { page, handlePreviousPage, handleNextPage } = usePagination();
  const pageSize = 5;
  const offset = pageSize * page;

  const {
    data: listResponse,
    error,
    isFetching,
    isLoading,
  } = useListSupportAccessGrantsQuery({
    "include-revoked": true,
    offset,
    limit: pageSize,
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
    pageSize,
    handlePreviousPage,
    handleNextPage,
    page,
  };
};
