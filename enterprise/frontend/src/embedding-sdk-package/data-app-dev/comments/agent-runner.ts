import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  DATA_APP_AGENT_MAX_OUTPUT_CHARS,
  PROMPT_FILE_PLACEHOLDER,
} from "../constants/comments-channel";
import type { DataAppAgentRun, DataAppComment } from "../types/comments";

import { getCommentsDirectory } from "./file";

/** How long output is batched before readers are told the run produced more. */
const OUTPUT_FLUSH_MS = 500;

export interface AgentRunnerOptions {
  /** The command from `DATA_APP_AGENT_CMD`; `null` when the author set none. */
  command: string | null;
  appRoot: string;
  /** Called whenever the run's state changes, so readers can be nudged. */
  onRunChange: (commentId: string, run: DataAppAgentRun) => void;
}

export type AgentStartResult =
  | { started: true; run: DataAppAgentRun }
  | { started: false; reason: string };

/**
 * Hands one comment to whatever coding agent the author configured.
 *
 * The agent is a command, not an integration: the prompt is plain markdown on
 * the command's stdin (and in a file, for a CLI that takes a path), so Claude
 * Code, Codex, Cursor, Aider or a shell script of the author's own all work the
 * same way. Nothing here knows which model is behind it.
 *
 * Runs are serialized. Two agents editing the same app's files at once produce
 * conflicting edits that neither of them can see, which is worse than waiting.
 */
export class AgentRunner {
  private runningCommentId: string | null = null;
  private child: ChildProcess | null = null;

  constructor(private readonly options: AgentRunnerOptions) {}

  isConfigured(): boolean {
    return this.options.command !== null;
  }

  getCommand(): string | null {
    return this.options.command;
  }

  getRunningCommentId(): string | null {
    return this.runningCommentId;
  }

  start(comment: DataAppComment, prompt: string): AgentStartResult {
    const { command, appRoot, onRunChange } = this.options;

    if (!command) {
      return {
        started: false,
        reason:
          "No agent command is configured. Set DATA_APP_AGENT_CMD in .env.local, " +
          'e.g. DATA_APP_AGENT_CMD="claude -p".',
      };
    }

    if (this.runningCommentId) {
      return {
        started: false,
        reason: `The agent is already working on ${this.runningCommentId}.`,
      };
    }

    const promptFile = this.writePrompt(comment.id, prompt);
    const run: DataAppAgentRun = {
      command,
      status: "running",
      startedAt: Date.now(),
      finishedAt: null,
      exitCode: null,
      output: "",
    };

    this.runningCommentId = comment.id;
    onRunChange(comment.id, run);

    const child = spawn(
      command.split(PROMPT_FILE_PLACEHOLDER).join(promptFile),
      {
        shell: true,
        cwd: appRoot,
        env: {
          ...process.env,
          DATA_APP_COMMENT_ID: comment.id,
          DATA_APP_COMMENT_PROMPT_FILE: promptFile,
        },
      },
    );

    this.child = child;
    this.pipe(child, comment.id, run, prompt);

    return { started: true, run };
  }

  /** Kills a run still in flight, for when the dev server shuts down. */
  dispose(): void {
    this.child?.kill();
    this.child = null;
    this.runningCommentId = null;
  }

  private writePrompt(commentId: string, prompt: string): string {
    const directory = getCommentsDirectory(this.options.appRoot);

    fs.mkdirSync(directory, { recursive: true });

    const promptFile = path.join(directory, `comment-${commentId}.prompt.md`);

    fs.writeFileSync(promptFile, prompt);

    return promptFile;
  }

  private pipe(
    child: ChildProcess,
    commentId: string,
    run: DataAppAgentRun,
    prompt: string,
  ): void {
    const { onRunChange } = this.options;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      flushTimer = null;
      onRunChange(commentId, { ...run });
    };

    const append = (chunk: unknown) => {
      run.output = `${run.output}${String(chunk)}`.slice(
        -DATA_APP_AGENT_MAX_OUTPUT_CHARS,
      );

      flushTimer ??= setTimeout(flush, OUTPUT_FLUSH_MS);
    };

    child.stdout?.on("data", append);
    child.stderr?.on("data", append);

    // A CLI that reads its prompt from the file (or ignores stdin entirely)
    // leaves this write unread, which surfaces as EPIPE rather than an error
    // worth reporting.
    child.stdin?.on("error", () => undefined);
    child.stdin?.end(prompt);

    const finish = (
      status: DataAppAgentRun["status"],
      exitCode: number | null,
    ) => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }

      run.status = status;
      run.exitCode = exitCode;
      run.finishedAt = Date.now();

      this.runningCommentId = null;
      this.child = null;

      onRunChange(commentId, { ...run });
    };

    child.on("error", (error) => {
      append(`\n${error.message}\n`);
      finish("failed", null);
    });

    child.on("close", (code) =>
      finish(code === 0 ? "done" : "failed", code ?? null),
    );
  }
}
