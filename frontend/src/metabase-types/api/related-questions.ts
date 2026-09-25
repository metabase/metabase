export type RelatedQuestion = {
  id: number;
  name: string;
  display_type?: string | null;
};

export type RelatedQuestionsRow = {
  question: RelatedQuestion;
  related_questions: RelatedQuestion[];
};

export type RelatedQuestionsResponse = {
  data: RelatedQuestionsRow[];
  total: number;
  offset: number;
  limit: number;
  pair_count: number;
  snapshot_revision: string | null;
};

export type RelatedQuestionsStatus = {
  available: boolean;
  state: string;
  processed_questions: number;
  total_questions: number;
  last_successful_completion: string | null;
  last_error: string | null;
  snapshot_revision: string | null;
  pair_count?: number;
};
