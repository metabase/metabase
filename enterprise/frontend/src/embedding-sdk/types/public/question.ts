export interface MetabaseQuestion {
  id: number;
  name: string | null;
  description: string | null;
  entityId: string;

  isSavedQuestion: boolean;
}
