export interface Task {
  id: number;
  db_id: number | null;
  duration: number;
  started_at: string;
  ended_at: string;
  task: string;
  task_details: object | null;
}
