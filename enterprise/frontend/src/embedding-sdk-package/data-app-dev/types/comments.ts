/** Where in the app's source the selected part of the UI was written. */
export interface DataAppCommentSource {
  /** Relative to the app directory when the file is inside it, absolute otherwise. */
  file: string;
  line: number;
  column: number | null;
}

export interface DataAppCommentRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DataAppCommentTarget {
  /** `element` for a click on one node, `region` for a dragged rectangle. */
  kind: "element" | "region";
  /** One line naming the selection, e.g. `OrdersTable › table.sales`. */
  label: string;
  /** CSS path from the app's root element, for re-finding the node later. */
  selector: string;
  /** The React components that rendered it, outermost first. */
  componentPath: string[];
  source: DataAppCommentSource | null;
  rect: DataAppCommentRect;
  viewport: { width: number; height: number };
  /** The app route the selection was made on, so a multi-page app is unambiguous. */
  route: string;
  text: string | null;
  html: string | null;
}

export interface DataAppCommentDraft {
  body: string;
  target: DataAppCommentTarget;
}

export type DataAppCommentStatus = "open" | "resolved";

export type DataAppAgentRunStatus = "running" | "done" | "failed";

export interface DataAppAgentRun {
  command: string;
  status: DataAppAgentRunStatus;
  startedAt: number;
  finishedAt: number | null;
  exitCode: number | null;
  /** The command's stdout and stderr, oldest first, truncated to the limit. */
  output: string;
}

export interface DataAppComment extends DataAppCommentDraft {
  id: string;
  status: DataAppCommentStatus;
  createdAt: number;
  resolvedAt: number | null;
  agentRun: DataAppAgentRun | null;
}

/** The shape of `.data-app/comments.json`, which an agent may read or rewrite. */
export interface DataAppCommentsFile {
  version: 1;
  comments: DataAppComment[];
}

export interface DataAppAgentStatus {
  /** Whether `DATA_APP_AGENT_CMD` is set, i.e. the dock can dispatch a comment. */
  configured: boolean;
  command: string | null;
  /** The comment whose run is in flight; runs are serialized. */
  runningCommentId: string | null;
}

export interface DataAppCommentsReport {
  comments: DataAppComment[];
  agent: DataAppAgentStatus;
  lastChangeAt: number | null;
}
