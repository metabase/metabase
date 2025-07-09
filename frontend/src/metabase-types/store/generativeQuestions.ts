export interface GenerativeQuestion {
  id: string;
  prompt: string;
  title?: string;
  content?: string;
  createdAt: number;
  updatedAt: number;
  loading?: boolean;
}

export interface GenerativeQuestionsState {
  questions: Record<string, GenerativeQuestion>;
  loading: boolean;
  error: string | null;
}
