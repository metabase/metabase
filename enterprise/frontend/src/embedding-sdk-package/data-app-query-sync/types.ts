export interface DiscoveredQuery {
  exportName: string;
  filePath: string;
  query: Record<string, unknown>;
  savedQuestionSourceId?: number;
  tableId: number;
  hash: string;
}
