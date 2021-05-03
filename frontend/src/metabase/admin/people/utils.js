export const isLastPage = (pageIndex, pageSize, total) =>
  pageIndex === Math.ceil(total / pageSize) - 1;
