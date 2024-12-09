export interface MetabaseQuestion {
  id: number;
  name: string;
  description: string | null;
  entityId: string;

  isSavedQuestion: boolean;
}
