export interface SlackScopesResponse {
  ok: boolean;
  actual: string[];
  expected: string[];
  missing: string[];
  error?: string;
}
