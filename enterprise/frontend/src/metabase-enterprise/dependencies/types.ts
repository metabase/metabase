export type NodeId = string;

export type NodeTypeInfo = {
  label: string;
  color: string;
};

export type NodeLink = {
  label: string;
  url: string;
};

export type TablePaginationOptions = {
  pageIndex: number;
  pageSize: number;
  total: number;
};

export type DependencyGraphRawParams = {
  id?: string;
  type?: string;
};
