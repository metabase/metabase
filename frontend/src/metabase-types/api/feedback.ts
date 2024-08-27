export interface Feedback {
  description: string; // Non-nullable string field
  task: string | null; // Nullable string field
  submitted_by: string | null; // Nullable string field
  chat_history: string | null; // Nullable string field
  subject: string; // Non-nullable string field
}
