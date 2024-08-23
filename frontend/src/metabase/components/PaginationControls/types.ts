export type PaginationControlsProps = {
  page: number;
  pageSize: number;
  itemsLength: number;
  total?: number;
  showTotal?: boolean;
  onNextPage?: (() => void) | null;
  onPreviousPage?: (() => void) | null;
};
