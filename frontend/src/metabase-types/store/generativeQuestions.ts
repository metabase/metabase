export interface GenerativeQuestionAuthor {
  id: string;
  name: string;
  type: "user" | "agent";
  role?: string;
}

export type ReviewStatus = "requested" | "commented" | "verified" | "problematic";

export interface GenerativeQuestionReviewer {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  status: ReviewStatus;
  requestedAt?: number;
  reviewedAt?: number;
  comment?: string;
  nodeId?: string; // Optional reference to specific text node
}

export interface GenerativeQuestionMetadata {
  authors: GenerativeQuestionAuthor[];
  reviewers: GenerativeQuestionReviewer[];
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
