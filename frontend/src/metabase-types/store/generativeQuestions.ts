export interface GenerativeQuestionAuthor {
  id: string;
  name: string;
  type: "user" | "agent";
  role?: string;
}

export interface GenerativeQuestionMetadata {
  authors: GenerativeQuestionAuthor[];
  tags?: string[];
  category?: string;
  difficulty?: "easy" | "medium" | "hard";
  estimatedTime?: number; // in minutes
}

export interface GenerativeQuestion {
  id: string;
  prompt: string;
  title?: string;
  content?: string;
  agentType: string;
  metadata: GenerativeQuestionMetadata;
  createdAt: number;
  updatedAt: number;
  loading?: boolean;
}

export interface GenerativeQuestionsState {
  questions: Record<string, GenerativeQuestion>;
  loading: boolean;
  error: string | null;
}
