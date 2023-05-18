export interface Revision {
  id: number;
  description: string;
  message: string | null;
  timestamp: string;
  is_creation: boolean;
  is_reversion: boolean;
  has_multiple_changes: boolean;
  diff: { before: Record<string, any>; after: Record<string, any> };
  user: {
    id: number;
    first_name: string;
    last_name: string;
    common_name: string;
  };
}
