export interface Download {
  id: number;
  title: string;
  status: "complete" | "in-progress" | "error";
  error?: string;
}

export type DownloadsState = Download[];
