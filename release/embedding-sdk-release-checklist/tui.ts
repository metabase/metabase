// The terminal UI: the status of every step in a list. Arrows move, Enter
// does the selected ⬜ step after a "yes", r checks every step again, q quits.
// In fake mode, m does by hand what a person does on GitHub (merge a PR...).
import confirm from "@inquirer/confirm";
import {
  ExitPromptError,
  createPrompt,
  isDownKey,
  isEnterKey,
  isUpKey,
  makeTheme,
  useEffect,
  useKeypress,
  useState,
} from "@inquirer/core";

import {
  type Interaction,
  type Step,
  type StepPullRequest,
  type StepResult,
  type StepState,
  checkWithoutThrowing,
  describeFailure,
} from "./checklist";
import { forgetNpmDistTags } from "./external-calls";

const ICONS: Record<StepState, string> = {
  done: "✅",
  todo: "⬜",
  blocked: "🔒",
  inProgress: "🟡",
  manual: "✋",
  error: "❌",
};

const SPINNER = makeTheme().spinner;

// null when the script talks to the real GitHub, npm and Docker Hub
type FakeMode = {
  stateFile: string;
  // "<name>: <what it is>"
  scenario: string;
  // what a person does by hand: merge a PR, fast-forward a branch...
  humanActions: () => { label: string; run: () => void }[];
} | null;

const terminal: Interaction = {
  confirm: (question) => confirm({ message: question, default: false }),
  print: (line) => console.log(colorize(line)),
  waitFor: (message, work) => withSpinner(`  ${message}`, work),
};

// --dry-run: the status once, and nothing else
export async function showStatus(
  steps: Step[],
  fakeMode: FakeMode,
): Promise<void> {
  printFakeModeBanner(fakeMode);
  forgetNpmDistTags();
  const results = await withSpinner(
    "Checking every step...",
    Promise.all(
      steps.map((step) =>
        step.kind === "step" ? checkWithoutThrowing(step) : null,
      ),
    ),
  );
  for (const row of rowsOf(steps, results)) {
    if (row.kind === "note") {
      console.log(noteLine(row.text));
      continue;
    }
    console.log(stepLine(row, ""));
    for (const line of row.result?.lines ?? []) {
      console.log(`      ${colorize(line)}`);
    }
    const linkLines = row.result ? linkSectionsOf(row.result) : [];
    for (const line of linkLines.filter(Boolean)) {
      console.log(`    ${line}`);
    }
  }
}

export async function runInTerminal(
  steps: Step[],
  fakeMode: FakeMode,
): Promise<void> {
  // with no terminal, the prompt waits for a key that never comes, at 100% CPU
  if (!process.stdin.isTTY) {
    console.error(
      "The checklist needs a terminal: running it without one is not supported. Use --dry-run to see the status.",
    );
    process.exitCode = 1;
    return;
  }
  let selected = steps.findIndex((step) => step.kind === "step");
  try {
    while (true) {
      const choice = await chooseStep({ steps, selected, fakeMode });
      if (choice.kind === "quit") {
        return;
      }
      selected = choice.index;
      if (choice.kind === "doTheStep") {
        await doTheStep(steps[choice.index], fakeMode);
      }
      if (choice.kind === "doAFakeHumanAction" && fakeMode) {
        await doAFakeHumanAction(fakeMode);
      }
    }
  } catch (failure) {
    // Ctrl+C in a prompt
    if (failure instanceof ExitPromptError) {
      return;
    }
    throw failure;
  }
}

// We check the step again before we ask: someone can change the state while
// the list is on screen.
async function doTheStep(step: Step, fakeMode: FakeMode): Promise<void> {
  if (step.kind === "note") {
    return;
  }
  printFakeModeBanner(fakeMode);
  forgetNpmDistTags();
  const resultNow = await withSpinner(
    `Checking "${step.title}" again...`,
    checkWithoutThrowing(step),
  );
  if (!resultNow.action) {
    console.log("\nThe state of this step changed:");
    console.log(`${ICONS[resultNow.state]} ${colorize(step.title)}`);
    for (const line of resultNow.lines) {
      console.log(`      ${colorize(line)}`);
    }
    return;
  }
  console.log(`\n▶ ${colorize(step.title)}`);
  for (const line of resultNow.action.description) {
    console.log(`  ${colorize(line)}`);
  }
  if (!(await terminal.confirm("Do it?"))) {
    console.log("  Skipped.");
    return;
  }
  try {
    await resultNow.action.run(terminal);
  } catch (failure) {
    // Ctrl+C at a question inside the action: we quit, as everywhere else
    if (failure instanceof ExitPromptError) {
      throw failure;
    }
    console.log(`  ❗ Failed: ${describeFailure(failure)}`);
    process.exitCode = 1;
  }
}

async function doAFakeHumanAction(
  fakeMode: NonNullable<FakeMode>,
): Promise<void> {
  const actions = fakeMode.humanActions();
  if (actions.length === 0) {
    console.log("\n  [fake] A person has nothing to do in the fake world now.");
    return;
  }
  const index = await chooseOne({
    title: "Do by hand, in the fake world:",
    labels: actions.map((action) => action.label),
    fakeMode,
  });
  if (index != null) {
    actions[index].run();
  }
}

// The list of steps

type Row =
  | { kind: "note"; text: string }
  | {
      kind: "step";
      number: number;
      title: string;
      about: string;
      // null while the check of the step runs
      result: StepResult | null;
    };

function rowsOf(steps: Step[], results: (StepResult | null)[]): Row[] {
  let number = 0;
  return steps.map((step, index): Row => {
    if (step.kind === "note") {
      return step;
    }
    number += 1;
    return {
      kind: "step",
      number,
      title: step.title,
      about: step.about,
      result: results[index] ?? null,
    };
  });
}

type Choice =
  | { kind: "doTheStep"; index: number }
  | { kind: "checkAgain"; index: number }
  | { kind: "doAFakeHumanAction"; index: number }
  | { kind: "quit" };

// The list shows at once, with a spinner on each step. Each step gets its icon
// when its own check ends.
const chooseStep = createPrompt<
  Choice,
  { steps: Step[]; selected: number; fakeMode: FakeMode }
>(({ steps, selected, fakeMode }, done) => {
  const [active, setActive] = useState(selected);
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<(StepResult | null)[]>(() =>
    steps.map(() => null),
  );
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const rows = rowsOf(steps, results);
  const stepIndexes = rows.flatMap((row, index) =>
    row.kind === "step" ? [index] : [],
  );
  const isAnyStepChecking = rows.some(
    (row) => row.kind === "step" && row.result === null,
  );

  // we check every step at the same time: checks only read
  useEffect(() => {
    let isPromptOpen = true;
    forgetNpmDistTags();
    steps.forEach((step, index) => {
      if (step.kind === "step") {
        void checkWithoutThrowing(step).then((result) => {
          if (isPromptOpen) {
            setResults((current) =>
              current.map((old, i) => (i === index ? result : old)),
            );
          }
        });
      }
    });
    return () => {
      isPromptOpen = false;
    };
    // `steps` is the same array for the whole prompt, so this runs once
  }, [steps]);

  useEffect(() => {
    if (!isAnyStepChecking) {
      return;
    }
    const timer = setInterval(
      () => setSpinnerFrame((frame) => frame + 1),
      SPINNER.interval,
    );
    return () => clearInterval(timer);
  }, [isAnyStepChecking]);

  useKeypress((key) => {
    setMessage("");
    const position = stepIndexes.indexOf(active);
    if (isUpKey(key)) {
      setActive(stepIndexes[Math.max(position - 1, 0)]);
    } else if (isDownKey(key)) {
      setActive(stepIndexes[Math.min(position + 1, stepIndexes.length - 1)]);
    } else if (isEnterKey(key)) {
      const row = rows[active];
      if (row.kind !== "step") {
        return;
      }
      if (!row.result) {
        setMessage("The check of this step still runs.");
      } else if (row.result.state === "todo") {
        done({ kind: "doTheStep", index: active });
      } else {
        setMessage("The script can do only the ⬜ steps.");
      }
    } else if (key.name === "r") {
      done({ kind: "checkAgain", index: active });
    } else if (key.name === "m" && fakeMode) {
      done({ kind: "doAFakeHumanAction", index: active });
    } else if (key.name === "q") {
      done({ kind: "quit" });
    }
  });

  const spinner = SPINNER.frames[spinnerFrame % SPINNER.frames.length];
  const list = rows.map((row, index) => {
    const cursor = index === active ? "❯" : " ";
    return `${cursor} ${row.kind === "note" ? noteLine(row.text) : stepLine(row, spinner)}`;
  });
  const activeRow = rows[active];
  const details =
    activeRow.kind === "step" ? detailsOf(activeRow, spinner) : [];
  const keys = fakeMode
    ? "↑↓ move · enter do the ⬜ step · r check again · m do by hand (fake) · q quit"
    : "↑↓ move · enter do the ⬜ step · r check again · q quit";
  const openPullRequests = openPullRequestsOf(rows);
  return [
    ...fakeModeBanner(fakeMode),
    ...list,
    "",
    ...(openPullRequests.length > 0 ? [...openPullRequests, ""] : []),
    ...details,
    "",
    message,
    style(DIM, keys),
  ].join("\n");
});

// A list of choices: arrows move, Enter chooses, q cancels (null).
const chooseOne = createPrompt<
  number | null,
  { title: string; labels: string[]; fakeMode: FakeMode }
>(({ title, labels, fakeMode }, done) => {
  const [active, setActive] = useState(0);
  useKeypress((key) => {
    if (isUpKey(key)) {
      setActive(Math.max(active - 1, 0));
    } else if (isDownKey(key)) {
      setActive(Math.min(active + 1, labels.length - 1));
    } else if (isEnterKey(key)) {
      done(active);
    } else if (key.name === "q" || key.name === "escape") {
      done(null);
    }
  });
  return [
    ...fakeModeBanner(fakeMode),
    title,
    ...labels.map(
      (label, index) => `${index === active ? "❯" : " "} ${colorize(label)}`,
    ),
    "",
    "↑↓ move · enter do it · q cancel",
  ].join("\n");
});

// The panel under the list, for the step under the cursor: what the step is,
// what the check found, what Enter does, and the pages to look at.
function detailsOf(row: Row & { kind: "step" }, spinner: string): string[] {
  const { result } = row;
  const about = [heading("What this step is:"), ...wrap(row.about, "    "), ""];
  if (!result) {
    return [...about, `${heading("Now:")} ${spinner} checking...`];
  }
  return [
    ...about,
    `${heading("Now:")} ${ICONS[result.state]} ${STATE_NAMES[result.state]}`,
    ...result.lines.flatMap((line) => wrap(line, "    ")),
    ...(result.action
      ? [
          "",
          heading("Enter does:"),
          ...result.action.description.flatMap((line) => wrap(line, "    ")),
        ]
      : []),
    ...linkSectionsOf(result),
  ];
}

// The PRs and pages of the step under two headers: this release, then
// earlier releases. A page that a line of the step already shows is not
// repeated.
export function linkSectionsOf(result: StepResult): string[] {
  const isInTheLinesAbove = (url: string) =>
    result.lines.some((line) => line.includes(url));
  const linesOf = (isAboutAnEarlierRelease: boolean) => [
    ...(result.pullRequests ?? [])
      .filter(
        (pr) =>
          Boolean(pr.isAboutAnEarlierRelease) === isAboutAnEarlierRelease &&
          !isInTheLinesAbove(pr.url),
      )
      .map(pullRequestLine),
    ...(result.links ?? [])
      .filter(
        (link) =>
          Boolean(link.isAboutAnEarlierRelease) === isAboutAnEarlierRelease &&
          !isInTheLinesAbove(link.url),
      )
      .map((link) => `    ${colorize(link.url)}  ${colorize(link.label)}`),
  ];
  const thisRelease = linesOf(false);
  const earlierReleases = linesOf(true);
  return [
    ...(thisRelease.length > 0
      ? ["", heading("Links about this release:"), ...thisRelease]
      : []),
    ...(earlierReleases.length > 0
      ? [
          "",
          heading("Links about earlier releases, for reference:"),
          ...earlierReleases,
        ]
      : []),
  ];
}

// "    open    https://github.com/.../pull/1  title"
function pullRequestLine(pullRequest: StepPullRequest): string {
  const state =
    pullRequest.state === "OPEN" && pullRequest.isDraft
      ? "draft"
      : pullRequest.state.toLowerCase();
  const label = pullRequest.label ? `${style(BOLD, pullRequest.label)}: ` : "";
  return `    ${style(PULL_REQUEST_STATE_COLORS[state] ?? "", state.padEnd(7))} ${colorize(pullRequest.url)}  ${label}${colorize(pullRequest.title)}`;
}

// every open or draft PR of every step, once
function openPullRequestsOf(rows: Row[]): string[] {
  const urls = new Set<string>();
  const lines: string[] = [];
  for (const row of rows) {
    if (row.kind !== "step") {
      continue;
    }
    for (const pullRequest of row.result?.pullRequests ?? []) {
      if (pullRequest.state === "OPEN" && !urls.has(pullRequest.url)) {
        urls.add(pullRequest.url);
        lines.push(pullRequestLine(pullRequest));
      }
    }
  }
  return lines.length > 0 ? [heading("Open pull requests:"), ...lines] : [];
}

const STATE_NAMES: Record<StepState, string> = {
  done: "done",
  todo: "to do: the script can do it",
  blocked: "blocked",
  inProgress: "in progress: check again later",
  manual: "a person must do it",
  error: "error",
};

// cuts a text into lines that fit the terminal, each one with the indent and
// its colors
function wrap(text: string, indent: string): string[] {
  const width = Math.max((process.stdout.columns ?? 100) - indent.length, 40);
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(`${indent}${colorize(line)}`);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  lines.push(`${indent}${colorize(line)}`);
  return lines;
}

function stepLine(row: Row & { kind: "step" }, spinner: string): string {
  const icon = row.result ? ICONS[row.result.state] : spinner;
  return `${icon} ${row.number}. ${colorize(row.title)}`;
}

function noteLine(text: string): string {
  return `ℹ️  ${colorize(text)}`;
}

// Colors, only in a terminal; NO_COLOR turns them off

const isColorOn = process.stdout.isTTY === true && !process.env.NO_COLOR;

// ANSI codes
const BOLD = "1";
const DIM = "2";
const RED = "31";
const GREEN = "32";
const BLUE = "34";
const MAGENTA = "35";
const CYAN = "36";

const PULL_REQUEST_STATE_COLORS: Record<string, string> = {
  open: GREEN,
  draft: DIM,
  merged: MAGENTA,
  closed: RED,
};

function ansi(code: string, text: string): string {
  return code ? `\x1b[${code}m${text}\x1b[0m` : text;
}

function style(code: string, text: string): string {
  return isColorOn ? ansi(code, text) : text;
}

function heading(text: string): string {
  return style(BOLD, text);
}

function colorize(text: string): string {
  return isColorOn ? highlight(text) : text;
}

const URL_PATTERN = /(https?:\/\/\S+)/;

// the sample app at the start of a title ("nextjs:"), repos and packages,
// branches and dist-tags, versions
const WORD_PATTERN = new RegExp(
  [
    String.raw`\b(nextjs|react|modular|shoppy)(?=:)`,
    String.raw`(@?metabase\/[\w.-]+)`,
    String.raw`\b(release-x\.\d+\.x|\d+-(?:stable|beta|alpha)|update-to-\d+|sdk-version-bump-\d[\w.-]*|master|main)\b`,
    String.raw`(v1\.\d+(?:\.[\dx]+)+|\^?\b0\.\d+(?:\.\d+)?(?:-[a-z]+\.\d+)?\b|(?<=Metabase )\d+\b)`,
  ].join("|"),
  "g",
);

// colors the words a person looks for; a link stays one blue piece
export function highlight(text: string): string {
  return text
    .split(URL_PATTERN)
    .map((part, index) =>
      index % 2 === 1
        ? ansi(BLUE, part)
        : part.replace(
            WORD_PATTERN,
            (
              word: string,
              sampleApp?: string,
              repo?: string,
              branch?: string,
            ) =>
              sampleApp
                ? ansi(`${BOLD};${GREEN}`, word)
                : repo
                  ? ansi(GREEN, word)
                  : branch
                    ? ansi(MAGENTA, word)
                    : ansi(CYAN, word),
          ),
    )
    .join("");
}

// a spinner on one line until `work` ends, then the line goes away; nothing
// when the output is a file or a pipe
async function withSpinner<T>(text: string, work: Promise<T>): Promise<T> {
  if (!process.stdout.isTTY) {
    return work;
  }
  let frame = 0;
  const timer = setInterval(() => {
    frame += 1;
    process.stdout.write(
      `\r${SPINNER.frames[frame % SPINNER.frames.length]} ${text}`,
    );
  }, SPINNER.interval);
  try {
    return await work;
  } finally {
    clearInterval(timer);
    process.stdout.write("\r\x1b[2K");
  }
}

// black on yellow, on top of every screen of a --fake run
function fakeModeBanner(fakeMode: FakeMode): string[] {
  if (!fakeMode) {
    return [];
  }
  const yellow = (text: string) => `\x1b[30;43m ${text} \x1b[0m`;
  return [
    yellow(
      `FAKE MODE (--fake): nothing is real, and nothing leaves this machine. State: ${fakeMode.stateFile}`,
    ),
    yellow(`Scenario ${fakeMode.scenario}`),
    yellow(
      "The ✋ commands are real: do not run them. Press m to do them in the fake world.",
    ),
    "",
  ];
}

function printFakeModeBanner(fakeMode: FakeMode): void {
  for (const line of fakeModeBanner(fakeMode)) {
    console.log(line);
  }
}
