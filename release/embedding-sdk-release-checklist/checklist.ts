// What a step is and how it reports its state. No UI here: the terminal UI
// (tui.ts) and a future automatic runner both use these types.
import { $ } from "bun";

import type { PullRequest } from "./external-calls";

// done: nothing to do.
// todo: the script can do it now, after a "yes".
// blocked: a prerequisite is missing, and the first line names it.
// inProgress: something runs by itself (a workflow, a cron): check again later.
// manual: a person must do it, and the lines say how.
// error: something is wrong, and the lines say what.
export type StepState =
  | "done"
  | "todo"
  | "blocked"
  | "inProgress"
  | "manual"
  | "error";

// How an action talks to the person who runs it. The terminal asks the
// person; an automatic runner can answer by its own rules.
export type Interaction = {
  confirm(question: string): Promise<boolean>;
  print(line: string): void;
  // shows `message` until `work` ends, for example with a spinner
  waitFor<T>(message: string, work: Promise<T>): Promise<T>;
};

// "stopped" when a warning or a "no" stopped the action halfway
export type ActionOutcome = "done" | "stopped";

export type Action = {
  // what the action will do, shown before we ask "Do it?"
  description: string[];
  run: (interaction: Interaction) => Promise<ActionOutcome>;
};

// a page to look at, for example a workflow run or the npm page of a version
export type Link = { label: string; url: string };

export type StepResult = {
  state: StepState;
  lines: string[];
  action?: Action;
  // the PRs of the step (open, draft or merged), shown with their links
  pullRequests?: PullRequest[];
  // the other pages of the step that exist now
  links?: Link[];
};

export type Step =
  | {
      kind: "step";
      // what to do, with a verb: "Bump master to the first alpha of 66"
      title: string;
      // what the step is and why we do it, in plain words
      about: string;
      check: () => Promise<StepResult>;
    }
  | { kind: "note"; text: string };

export function step(
  title: string,
  about: string,
  check: () => Promise<StepResult>,
): Step {
  return { kind: "step", title, about, check };
}

export function note(text: string): Step {
  return { kind: "note", text };
}

export function done(...lines: string[]): StepResult {
  return { state: "done", lines };
}

export function todo(action: Action, ...lines: string[]): StepResult {
  return { state: "todo", lines, action };
}

// `prerequisite` is an earlier step or an outside thing, for example "the
// patch bump (npm has no 65-stable yet)"
export function blocked(prerequisite: string, ...lines: string[]): StepResult {
  return { state: "blocked", lines: [`blocked by ${prerequisite}`, ...lines] };
}

export function inProgress(...lines: string[]): StepResult {
  return { state: "inProgress", lines };
}

export function manual(...lines: string[]): StepResult {
  return { state: "manual", lines };
}

export function error(...lines: string[]): StepResult {
  return { state: "error", lines };
}

export function withLinks(
  result: StepResult,
  {
    pullRequests = [],
    links = [],
  }: { pullRequests?: PullRequest[]; links?: Link[] },
): StepResult {
  return { ...result, pullRequests, links };
}

// A check that throws shows as an error, and the other steps still show.
export async function checkWithoutThrowing(step: {
  check: () => Promise<StepResult>;
}): Promise<StepResult> {
  try {
    return await step.check();
  } catch (failure) {
    return error(`the check failed: ${describeFailure(failure)}`);
  }
}

// Bun's shell errors keep the command's stderr apart from the message.
export function describeFailure(failure: unknown): string {
  if (failure instanceof $.ShellError) {
    return `${failure.message}\n${failure.stderr.toString().trim()}`;
  }
  return failure instanceof Error ? failure.message : String(failure);
}

// Shows the warnings and asks to go on.
export async function askToContinueDespiteWarnings(
  interaction: Interaction,
  warnings: string[],
): Promise<boolean> {
  if (warnings.length === 0) {
    return true;
  }
  for (const warning of warnings) {
    interaction.print(`  ⚠️  ${warning}`);
  }
  if (!(await interaction.confirm("Continue anyway?"))) {
    interaction.print("  Stopped.");
    return false;
  }
  return true;
}
