export type SemanticDuplicateQuestion = {
  id: number;
  name: string;
  display_type?: string | null;
};

export type SemanticDuplicateRow = {
  question: SemanticDuplicateQuestion;
  duplicates: SemanticDuplicateQuestion[];
};

export type SemanticDuplicatesResponse = {
  data: SemanticDuplicateRow[];
  total: number;
  offset: number;
  limit: number;
  pair_count: number;
  snapshot_revision: string | null;
};

export type SemanticDuplicatesStatus = {
  available: boolean;
  state: string;
  processed_questions: number;
  total_questions: number;
  last_successful_completion: string | null;
  last_error: string | null;
  snapshot_revision: string | null;
  pair_count?: number;
};
