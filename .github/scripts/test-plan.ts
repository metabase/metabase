#!/usr/bin/env bun
/**
 * Builds and reads the CI test plan.
 *
 * A plan is a plain JSON object that records, for one set of inputs, which
 * workflows run and which jobs inside them run — plus the reason for each
 * decision. A workflow may carry conditions of its own, which gate every job
 * in it: fail them and nothing inside runs, pass them and each job is still
 * asked its own question. CI builds the plan once, up front, and every later job reads it
 * instead of re-deriving the answer, so there is a single place where "does
 * this run?" is decided and a single artefact to look at when it surprises you.
 *
 * `create` resolves its inputs from a pull request (--pr, via gh) or from the
 * flags directly, so the same command run on a laptop and in CI produces the
 * same plan. `execute` answers a single should-this-run question. `verify` is
 * the required check: it takes the plan and the `needs` context and confirms
 * every job the plan asked for actually ran and passed. `sync` keeps the list
 * of jobs in the config honest by reading it back off the workflow files.
 *
 * The flags live with the commands themselves, at the bottom of this file:
 * run `test-plan.ts --help`, or `test-plan.ts <command> --help`.
 */

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

import { load } from "js-yaml";
import { isMatch } from "micromatch";

import {
  changedFiles,
  defaultBase,
  matchGroups,
  parseFilters,
} from "./paths-filter";

export const PLAN_VERSION = 3;

/**
 * Everything known without looking at the diff. Overrides decide from this
 * alone — which is what lets `create` skip working the diff out at all when
 * one of them applies. Extend this to add a new input.
 */
export type PlanContext = {
  event: string;
  ref: string;
  baseRef: string | null;
  draft: boolean;
  labels: string[];
};

/** What changed, once someone actually needs to know. */
export type PlanDiff = {
  changedFiles: string[];
  changedGroups: string[];
};

/** The context plus the diff: everything a condition is tested against. */
export type Facts = PlanContext & { changedGroups: string[] };

/**
 * What the plan records: the context, and the diff if one was needed. Both
 * lists are null when there is no diff, either because an override settled
 * everything without one or because working it out failed; `override` says
 * which.
 */
export type PlanInputs = PlanContext & {
  changedFiles: string[] | null;
  changedGroups: string[] | null;
};

export type JobPlan = { run: boolean; reason: string };
export type WorkflowPlan = {
  run: boolean;
  /** Why the workflow as a whole came out the way it did. */
  reason: string;
  jobs: Record<string, JobPlan>;
};

export type TestPlan = {
  version: number;
  createdAt: string;
  inputs: PlanInputs;
  override: string | null;
  workflows: Record<string, WorkflowPlan>;
};

/**
 * A `run:` or `skip:` block: some conditions, and whether they are anded or
 * ored together. `all` is the default, so the common case — a label and an
 * event, both of which must hold — needs no `condition:` line.
 */
export type Condition = {
  mode: "all" | "any";
  /** Predicate name to its parsed value, in the order the YAML listed them. */
  predicates: Record<string, unknown>;
  /**
   * Overrides this block sits out, by id. An override normally settles every
   * job in every workflow before a block is so much as read; naming one here
   * says it has no effect here, and the job is decided from its own
   * conditions exactly as it would be on an ordinary run.
   *
   * It is not a condition — it never makes the block match or fail to match.
   */
  ignoreOverrides: string[];
};

/**
 * The blocks a job or a workflow may carry, whatever else it has on it.
 * `LADDER` is what settles them against each other.
 */
export type Blocks = {
  "force-skip"?: Condition | null;
  run?: Condition | null;
  skip?: Condition | null;
};

/** An override gets the two blocks that make sense above a workflow. */
export type Override = Pick<Blocks, "run" | "skip"> & {
  id: string;
  reason: string;
};

export type JobConfig = Blocks & {
  /**
   * The workflow this job calls, for a job whose whole body is `uses:`. It runs
   * when the workflow it calls has work in it, so the called workflow's own
   * jobs, described here like any other, are most of what settles it.
   *
   * Blocks alongside a `calls` gate the call itself, from above: they are the
   * caller's `if:`, and they reach the whole of the called workflow. Put a
   * condition here when the caller is what knows about it — the diff or the
   * branch that decides whether entering the workflow makes sense at all — and
   * on the called workflow when it is a condition its own jobs share.
   */
  calls?: string;
};

/**
 * A workflow: its own conditions, and the jobs inside it.
 *
 * The workflow's blocks are a gate on everything below them. They are asked
 * first, and a job is only asked its own question once they have let it
 * through — so `backend` can say "only when the backend changed" once, in one
 * place, instead of every job in it repeating the same `paths:` line.
 *
 * A gate only ever holds jobs back. Matching a workflow's `run:` is permission
 * for its jobs to be considered, never an instruction that they run: a job
 * whose own conditions are unmet still skips. That is what keeps the gate a
 * summary of its jobs rather than a second, competing answer.
 */
export type WorkflowConfig = Blocks & {
  jobs: Record<string, JobConfig>;
};

export type PlanConfig = {
  overrides: Override[];
  workflows: Record<string, WorkflowConfig>;
};

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

type PredicateSpec<T = unknown> = {
  /** Checks what the YAML said and normalises it, once, at parse time. */
  parse: (value: unknown, where: string) => T;
  test: (value: T, facts: Facts) => boolean;
  /**
   * The value as it appears in a plan's reasons. `facts` is passed when the
   * predicate matched, so a list can name the entries that did the matching
   * rather than repeating the whole thing back.
   */
  describe: (value: T, facts?: Facts) => string;
  /** True for a predicate that cannot be answered until the diff is known. */
  needsDiff?: boolean;
};

/**
 * Declares a predicate, keeping `test` and `describe` in terms of whatever
 * `parse` returns rather than making every one of them re-narrow `unknown`.
 *
 * A config is untyped until it has been through `parse`, and `parse` is the
 * only way a value reaches the other two — nothing calls `test` on a value
 * that did not come out of the `parse` beside it. That is what the cast below
 * records, in one place, instead of once per predicate.
 */
function predicateSpec<T>(spec: PredicateSpec<T>): PredicateSpec {
  // Safe because `parse` is the only door in: see the note above.
  return spec as PredicateSpec;
}

/**
 * The conditions a `run:` or `skip:` block may use. A new input is a new entry
 * here plus a field on PlanContext — nothing else in the pipeline changes.
 *
 * Anything marked `needsDiff` is barred from an override, which is what keeps
 * the "an override settles it without working the diff out" shortcut honest.
 */
export const PREDICATES: Record<string, PredicateSpec> = {
  labels: predicateSpec({
    parse: stringList,
    test: (value, facts) => matchesAny(value, facts.labels),
    describe: list,
  }),
  branch: predicateSpec({
    parse: stringList,
    test: (value, facts) => matchesAny(value, [facts.ref]),
    describe: list,
  }),
  event: predicateSpec({
    parse: stringList,
    test: (value, facts) => value.includes(facts.event),
    describe: list,
  }),
  draft: predicateSpec({
    parse: (value, where) => {
      if (typeof value !== "boolean") {
        throw new Error(`${where} must be true or false`);
      }

      return value;
    },
    test: (value, facts) => value === facts.draft,
    describe: String,
  }),
  paths: predicateSpec({
    parse: stringList,
    test: (value, facts) => changedIn(value, facts).length > 0,
    // "changed: src" is the useful half of "one of src, workflows changed".
    describe: (value, facts) => {
      const hits = facts ? changedIn(value, facts) : [];

      return list(hits.length > 0 ? hits : value);
    },
    needsDiff: true,
  }),
};

function list(value: string[]): string {
  return value.join(", ");
}

function changedIn(groups: string[], facts: Facts): string[] {
  return groups.filter((group) => facts.changedGroups.includes(group));
}

/**
 * True when any pattern matches any value. Patterns are globs, so a plain name
 * with no wildcard in it is simply an exact match — which is what lets one
 * list hold `master`, `release-x.*` and `ci:run-*` side by side. As usual `*`
 * stops at a `/` and `**` does not.
 *
 * Matched with micromatch, the same engine the path groups go through, so a
 * pattern means one thing wherever it is written in the config.
 */
function matchesAny(patterns: string[], values: string[]): boolean {
  return patterns.some((pattern) =>
    values.some((value) => isMatch(value, pattern, { dot: true })),
  );
}

function stringList(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new Error(`${where} must be a list of strings`);
  }

  return value;
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

/** The predicates that hold — both the answer and the reason for it. */
function matched(condition: Condition, facts: Facts): string[] {
  return Object.entries(condition.predicates)
    .filter(([name, value]) => predicate(name).test(value, facts))
    .map(([name]) => name);
}

/** `all` needs every predicate, `any` needs one. An empty block is rejected. */
function holds(condition: Condition, hits: string[]): boolean {
  return condition.mode === "any"
    ? hits.length > 0
    : hits.length === Object.keys(condition.predicates).length;
}

export function matchesCondition(condition: Condition, facts: Facts): boolean {
  return holds(condition, matched(condition, facts));
}

/** True when any block of these sits the named override out. */
export function ignoresOverride(blocks: Blocks, id: string): boolean {
  return LADDER.some(({ block }) => blocks[block]?.ignoreOverrides.includes(id));
}

function predicate(name: string): PredicateSpec {
  const spec = PREDICATES[name];

  if (!spec) {
    throw new Error(
      `unknown condition "${name}", expected one of ${Object.keys(PREDICATES).join(", ")}`,
    );
  }

  return spec;
}

/** The whole block, joined the way it is read: `labels: a or paths: src`. */
function describeCondition(condition: Condition): string {
  return describe(condition, Object.keys(condition.predicates), condition.mode);
}

/** The predicates that matched. They all hold, so they read as an `and`. */
function describeMatched(
  condition: Condition,
  hits: string[],
  facts: Facts,
): string {
  return describe(condition, hits, "all", facts);
}

function describe(
  condition: Condition,
  names: string[],
  mode: "all" | "any",
  facts?: Facts,
): string {
  return names
    .map(
      (name) =>
        `${name}: ${predicate(name).describe(condition.predicates[name], facts)}`,
    )
    .join(mode === "any" ? " or " : " and ");
}

/**
 * Every block there is, strongest first. This list is the whole of the
 * run/skip rulebook, and the order is the rule:
 *
 *   force-skip  an unconditional no. Nothing below it can talk it round, so
 *               it is the way to hold a job back even when the diff, or a
 *               label, is asking for it. An override still outranks it; a
 *               block that has to survive one names it in `ignore-overrides`.
 *   run         asking for something to run is a positive instruction, and it
 *               outranks a plain skip.
 *   skip        the weakest, since it only ever says "no reason to bother".
 *
 * The same ladder reads a job's blocks and the blocks of the workflow holding
 * it; they differ only in what happens when nothing matches, and in a gate
 * being unable to compel a job to run. Above both sits an override, which is
 * decided first and outranks all of it. `override` marks the blocks an
 * override may use — `force-skip` would be meaningless there, since an
 * override that wants to skip something already has `skip` and already wins.
 */
const LADDER = [
  { block: "force-skip", run: false, override: false },
  { block: "run", run: true, override: true },
  { block: "skip", run: false, override: true },
] as const;

const OVERRIDE_BLOCKS = LADDER.filter((rung) => rung.override);

type Verdict = {
  run: boolean;
  /** The block that settled it, named as the YAML names it. */
  block: (typeof LADDER)[number]["block"];
  condition: Condition;
  hits: string[];
};

/**
 * The strongest block whose conditions hold. Null when none of them did —
 * which is not the same as "skip", since what that means depends on whether
 * there was a `run:` block to fail to match in the first place.
 */
function weigh(blocks: Blocks, facts: Facts): Verdict | null {
  for (const { block, run } of LADDER) {
    const condition = blocks[block];

    if (!condition) {
      continue;
    }

    const hits = matched(condition, facts);

    if (holds(condition, hits)) {
      return { run, block, condition, hits };
    }
  }

  return null;
}

/**
 * The strongest block the verdict overruled, of those that would have decided
 * differently. Worth naming in a reason: it is the half of the answer that
 * surprises whoever went looking.
 */
function overruled(
  blocks: Blocks,
  verdict: Verdict,
  facts: Facts,
): string | null {
  const below = LADDER.slice(
    LADDER.findIndex(({ block }) => block === verdict.block) + 1,
  );

  const loser = below.find(({ block, run }) => {
    const condition = blocks[block];

    return (
      run !== verdict.run && condition && matchesCondition(condition, facts)
    );
  });

  return loser?.block ?? null;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads one `run:` or `skip:` block.
 *
 * `allowDiff` is false for an override, whose whole point is to settle the run
 * before anyone has worked out what changed; a `paths:` there would be a
 * condition that can never be honestly answered, so it is an error rather than
 * something that quietly never matches.
 *
 * `overrideIds` is every override the config declares, which is what an
 * `ignore-overrides` entry is checked against — a typo there would otherwise
 * be a block that quietly sits out nothing at all. It is null inside an
 * override, where the key makes no sense.
 */
export function parseCondition(
  value: unknown,
  where: string,
  allowDiff = true,
  overrideIds: string[] | null = [],
): Condition {
  if (!isRecord(value)) {
    throw new Error(`${where} must be a mapping of conditions`);
  }

  const {
    condition: mode = "all",
    "ignore-overrides": rawIgnore,
    ...rest
  } = value;

  if (mode !== "all" && mode !== "any") {
    throw new Error(`${where}.condition must be all | any`);
  }

  const ignoreOverrides = parseIgnoreOverrides(rawIgnore, where, overrideIds);
  const predicates: Record<string, unknown> = {};

  for (const [name, raw] of Object.entries(rest)) {
    const spec = PREDICATES[name];

    if (!spec) {
      throw new Error(
        `${where} has unknown condition "${name}", expected one of ${Object.keys(PREDICATES).join(", ")}`,
      );
    }

    if (spec.needsDiff && !allowDiff) {
      throw new Error(
        `${where} cannot use "${name}" — an override is decided before the diff is worked out`,
      );
    }

    predicates[name] = spec.parse(raw, `${where}.${name}`);
  }

  if (Object.keys(predicates).length === 0) {
    throw new Error(`${where} needs at least one condition`);
  }

  return { mode, predicates, ignoreOverrides };
}

/**
 * The overrides a block sits out.
 *
 * Every id has to name an override that exists. An `ignore-overrides` entry is
 * silent when it is right — the block simply behaves as it always did — so a
 * misspelt one would never show up as anything but the override applying after
 * all, on the one run the block was written to survive.
 */
function parseIgnoreOverrides(
  value: unknown,
  where: string,
  overrideIds: string[] | null,
): string[] {
  if (value === undefined) {
    return [];
  }

  if (overrideIds === null) {
    throw new Error(
      `${where} cannot use \`ignore-overrides\` — an override does not sit itself out`,
    );
  }

  const ids = stringList(value, `${where}.ignore-overrides`);

  for (const id of ids) {
    if (!overrideIds.includes(id)) {
      throw new Error(
        `${where}.ignore-overrides names unknown override "${id}", expected one of ${overrideIds.join(", ") || "(none declared)"}`,
      );
    }
  }

  return ids;
}

/** Reads whichever of `rungs` blocks are present, for jobs and overrides alike. */
function parseBlocks(
  raw: Record<string, unknown>,
  where: string,
  rungs: readonly { block: keyof Blocks }[],
  allowDiff: boolean,
  overrideIds: string[] | null = [],
): Blocks {
  const blocks: Blocks = {};

  for (const { block } of rungs) {
    if (raw[block] !== undefined) {
      blocks[block] = parseCondition(
        raw[block],
        `${where}.${block}`,
        allowDiff,
        overrideIds,
      );
    }
  }

  return blocks;
}

export function parseConfig(source: string): PlanConfig {
  const parsed = load(source);

  if (!isRecord(parsed)) {
    throw new Error("test plan config must be a mapping");
  }

  const rawOverrides = parsed.overrides ?? [];

  if (!Array.isArray(rawOverrides)) {
    throw new Error("`overrides` must be a list");
  }

  const overrides = rawOverrides.map((raw, index) => {
    if (!isRecord(raw)) {
      throw new Error(`override ${index} must be a mapping`);
    }

    const id = typeof raw.id === "string" ? raw.id : `override-${index}`;

    for (const { block, override } of LADDER) {
      if (!override && raw[block] !== undefined) {
        throw new Error(
          `override "${id}" cannot use \`${block}\` — that is a workflow level setting, and an override already outranks everything a workflow says`,
        );
      }
    }

    if (OVERRIDE_BLOCKS.every(({ block }) => raw[block] === undefined)) {
      throw new Error(
        `override "${id}" needs a ${OVERRIDE_BLOCKS.map(({ block }) => `\`${block}\``).join(" or ")} block`,
      );
    }

    return {
      id,
      ...parseBlocks(raw, `override "${id}"`, OVERRIDE_BLOCKS, false, null),
      reason: typeof raw.reason === "string" ? raw.reason : id,
    } satisfies Override;
  });

  // What an `ignore-overrides` entry below is allowed to name.
  const overrideIds = overrides.map(({ id }) => id);

  if (!isRecord(parsed.workflows)) {
    throw new Error("`workflows` must be a mapping of workflow name to jobs");
  }

  const workflows: PlanConfig["workflows"] = {};

  for (const [workflow, rawWorkflow] of Object.entries(parsed.workflows)) {
    if (!isRecord(rawWorkflow) || !isRecord(rawWorkflow.jobs)) {
      throw new Error(`workflow "${workflow}" needs a \`jobs\` mapping`);
    }

    const jobs: Record<string, JobConfig> = {};

    for (const [job, rawJob] of Object.entries(rawWorkflow.jobs)) {
      // `job:` with nothing under it parses as null, and means "no conditions".
      const options = rawJob ?? {};

      if (!isRecord(options)) {
        throw new Error(`job "${workflow}/${job}" must be a mapping`);
      }

      const where = `job "${workflow}/${job}"`;

      jobs[job] = {
        calls: parseCalls(options, where),
        ...parseBlocks(options, where, LADDER, true, overrideIds),
      };
    }

    workflows[workflow] = {
      ...parseBlocks(
        rawWorkflow,
        `workflow "${workflow}"`,
        LADDER,
        true,
        overrideIds,
      ),
      jobs,
    };
  }

  validateCalls(workflows);

  return { overrides, workflows };
}

/** The workflow a job calls, if it calls one. Its blocks gate the call. */
function parseCalls(
  options: Record<string, unknown>,
  where: string,
): string | undefined {
  if (options.calls === undefined) {
    return undefined;
  }

  if (typeof options.calls !== "string") {
    throw new Error(`${where}.calls must be the name of a workflow`);
  }

  return options.calls;
}

/**
 * A called workflow has to be described here, or nothing can plan its jobs —
 * and it has to be called from one place only, since the calling job's own
 * conditions gate it and two callers would be two different gates on one plan.
 */
function validateCalls(workflows: PlanConfig["workflows"]): void {
  const callers: Record<string, string> = {};

  for (const [workflow, { jobs }] of Object.entries(workflows)) {
    for (const [job, options] of Object.entries(jobs)) {
      if (options.calls === undefined) {
        continue;
      }

      if (!workflows[options.calls]) {
        throw new Error(
          `job "${workflow}/${job}" calls workflow "${options.calls}", which is not described here — add it under \`workflows\``,
        );
      }

      const already = callers[options.calls];

      if (already) {
        throw new Error(
          `workflow "${options.calls}" is called by both "${already}" and "${workflow}/${job}" — it can only be called from one place, since the calling job's conditions gate it`,
        );
      }

      callers[options.calls] = `${workflow}/${job}`;
    }
  }
}

/** Where each called workflow is called from, by the name of the workflow. */
function callSites(workflows: PlanConfig["workflows"]): Record<string, true> {
  const called: Record<string, true> = {};

  for (const { jobs } of Object.values(workflows)) {
    for (const { calls } of Object.values(jobs)) {
      if (calls !== undefined) {
        called[calls] = true;
      }
    }
  }

  return called;
}

/** Every `paths` group a job or workflow filters on, wherever it sits. */
function pathGroups(options: Blocks): string[] {
  return LADDER.flatMap(({ block }) => {
    const groups = options[block]?.predicates.paths;

    // A predicate holds whatever its own `parse` returned, which for `paths`
    // is the list of group names `stringList` checked.
    return Array.isArray(groups) ? (groups as string[]) : [];
  });
}

/** Catches a `paths` group that no longer exists in the paths-filter config. */
export function validateGroups(config: PlanConfig, known: string[]): void {
  const check = (where: string, options: Blocks): void => {
    for (const group of pathGroups(options)) {
      if (!known.includes(group)) {
        throw new Error(
          `${where} filters on unknown path group "${group}", expected one of ${known.join(", ")}`,
        );
      }
    }
  };

  for (const [workflow, options] of Object.entries(config.workflows)) {
    check(`workflow "${workflow}"`, options);

    for (const [job, jobOptions] of Object.entries(options.jobs)) {
      check(`job "${workflow}/${job}"`, jobOptions);
    }
  }
}

// ---------------------------------------------------------------------------
// Syncing the config with the workflows
// ---------------------------------------------------------------------------

/**
 * A workflow file, as far as the config is concerned: what jobs there are,
 * which of them are a call, and which of them are the plan's own machinery.
 */
type RawJob = { uses?: unknown; steps?: unknown };

/** One job of a workflow, as the workflow file describes it. */
export type ScaffoldJob = { job: string; calls?: string };

/** Every workflow reached from the entry one, in the order they were reached. */
export type Scaffold = Record<string, ScaffoldJob[]>;

/**
 * How a job spells a call to a workflow in this repository. A `uses:` that
 * points anywhere else names a workflow whose jobs are not ours to describe,
 * so it stays a job like any other rather than becoming a `calls`.
 */
const LOCAL_WORKFLOW = /^\.?\/?\.github\/workflows\/([\w.-]+)\.ya?ml$/;

/** This script, as a workflow step spells it. */
const PLAN_SCRIPT = "test-plan.ts";

/**
 * True for the job that builds the plan and the job that checks it afterwards.
 * Neither can be governed by the plan — one runs before there is a plan to
 * consult, and the other has to run whatever the plan said — so the config
 * leaves them out, and a sync has to leave them out too.
 */
function runsThePlan(job: RawJob): boolean {
  return (
    Array.isArray(job.steps) &&
    job.steps.some(
      (step) =>
        isRecord(step) &&
        typeof step.run === "string" &&
        step.run.includes(PLAN_SCRIPT),
    )
  );
}

function parseWorkflowFile(
  source: string,
  workflow: string,
): Record<string, RawJob> {
  const parsed = load(source);

  if (!isRecord(parsed) || !isRecord(parsed.jobs)) {
    throw new Error(`workflow "${workflow}" has no \`jobs\` mapping`);
  }

  const jobs: Record<string, RawJob> = {};

  for (const [job, raw] of Object.entries(parsed.jobs)) {
    if (!isRecord(raw)) {
      throw new Error(`job "${workflow}/${job}" must be a mapping`);
    }

    jobs[job] = raw;
  }

  return jobs;
}

/**
 * The jobs of a workflow and of every workflow it calls, however deep the
 * calls go.
 *
 * This is the half of the config the workflow files already know: what jobs
 * there are, and which of them are nothing but a call. The other half — when
 * any of it runs — is not in the workflows at all any more, which is the whole
 * point of the config, so nothing here invents one.
 */
export async function scaffoldWorkflows(
  entry: string,
  read: (workflow: string) => Promise<string>,
): Promise<Scaffold> {
  const scaffold: Scaffold = {};
  const calling: string[] = [];

  const walk = async (workflow: string): Promise<void> => {
    if (calling.includes(workflow)) {
      throw new Error(
        `workflow "${workflow}" ends up calling itself: ${[...calling, workflow].join(" -> ")}`,
      );
    }

    if (scaffold[workflow]) {
      return;
    }

    calling.push(workflow);

    const jobs = Object.entries(
      parseWorkflowFile(await read(workflow), workflow),
    )
      .filter(([, raw]) => !runsThePlan(raw))
      .map(([job, raw]) => {
        const calls =
          typeof raw.uses === "string"
            ? LOCAL_WORKFLOW.exec(raw.uses)?.[1]
            : undefined;

        return calls === undefined ? { job } : { job, calls };
      });

    // Recorded before the calls are followed, so the entry workflow leads and
    // a called one lands next to the caller that reached it.
    scaffold[workflow] = jobs;

    for (const { calls } of jobs) {
      if (calls !== undefined) {
        await walk(calls);
      }
    }

    calling.pop();
  };

  await walk(entry);

  return scaffold;
}

// A config is read back as text rather than as YAML, because what is being
// kept is the text: the conditions someone wrote, in the shape they wrote
// them, with the comments explaining why. Parsing and re-emitting would lose
// all three. The indents are fixed by the format, so the keys can be found by
// how far in they sit.
const WORKFLOW_INDENT = 2;
const JOB_INDENT = 6;

type Section = { start: number; end: number };

/**
 * Where the `workflows:` block sits, as a half-open range of line indices. It
 * runs to the next line starting in the first column — the next top-level key,
 * or the comment introducing it — and never includes the blank lines before it.
 */
function workflowsSection(lines: string[]): Section | null {
  const start = lines.findIndex((line) => /^workflows:(\s|$)/.test(line));

  if (start === -1) {
    return null;
  }

  const next = lines.findIndex(
    (line, index) => index > start && /^\S/.test(line),
  );

  let end = next === -1 ? lines.length : next;

  while (end > start + 1 && lines[end - 1]?.trim() === "") {
    end -= 1;
  }

  return { start, end };
}

type KeyLine = {
  line: number;
  indent: number;
  key: string;
  /** Whatever followed the key on the same line, `job: *backend` and all. */
  inline: string;
};

function keyLines(lines: string[], { start, end }: Section): KeyLine[] {
  const keys: KeyLine[] = [];

  for (let i = start; i < end; i += 1) {
    const match = /^(\s*)([\w.-]+):(?:[ \t]+(.*))?$/.exec(lines[i] ?? "");

    if (match) {
      const [, indent = "", key = "", inline = ""] = match;

      keys.push({ line: i, indent: indent.length, key, inline });
    }
  }

  return keys;
}

/**
 * What a config already says about one job: whatever sits on the job's own
 * line, and the lines indented under it.
 *
 * The inline half is easy to forget and expensive to lose. `job: *backend` is
 * a whole condition written on one line, and a sync that kept only the (empty)
 * body would turn it into `job:` — which reads as "always runs".
 */
export type JobText = { inline: string; body: string[] };

/**
 * What a config already says about one workflow: the blocks written above its
 * `jobs:`, and then each job.
 */
export type ExistingWorkflow = {
  /** The workflow's own lines, `run:` and its conditions, verbatim. */
  blocks: string[];
  jobs: Record<string, JobText>;
};

/** What a config already says, by workflow and then by job. */
export type ExistingConfig = Record<string, ExistingWorkflow>;

/**
 * Everything an existing config describes, exactly as it is written. A job
 * with nothing on or under it is still the config saying something: that the
 * job runs unconditionally.
 */
export function existingConfig(config: string): ExistingConfig {
  const lines = config.split("\n");
  const section = workflowsSection(lines);

  if (!section) {
    return {};
  }

  const keys = keyLines(lines, { start: section.start + 1, end: section.end });
  const existing: ExistingConfig = {};
  // The workflow the walk is inside, so nothing below has to look it back up.
  let current: ExistingWorkflow | null = null;
  // A workflow's own conditions sit at the same depth as `jobs:`, and the
  // conditions under them at the same depth as a job. Only once `jobs:` has
  // been passed does a key that deep name a job rather than a `paths:` list.
  let inJobs = false;

  keys.forEach((entry, index) => {
    if (entry.indent === WORKFLOW_INDENT) {
      current = existing[entry.key] ??= { blocks: [], jobs: {} };
      inJobs = false;
      return;
    }

    if (current === null) {
      return;
    }

    if (entry.indent === WORKFLOW_INDENT + 2 && entry.key === "jobs") {
      // Everything between the workflow's name and its `jobs:` is the gate.
      current.blocks = trimBlank(
        lines.slice(sectionStart(keys, index), entry.line),
      );
      inJobs = true;
      return;
    }

    if (entry.indent !== JOB_INDENT || !inJobs) {
      return;
    }

    // The job's body runs to the next job, the next workflow, or the end.
    const next = keys.slice(index + 1).find((key) => key.indent <= JOB_INDENT);
    const body = trimBlank(
      lines.slice(entry.line + 1, next?.line ?? section.end),
    );

    current.jobs[entry.key] = { inline: entry.inline, body };
  });

  return existing;
}

/** Where the workflow holding `keys[index]` puts its first line. */
function sectionStart(keys: KeyLine[], index: number): number {
  for (let i = index - 1; i >= 0; i -= 1) {
    const key = keys[i];

    if (key && key.indent === WORKFLOW_INDENT) {
      return key.line + 1;
    }
  }

  return 0;
}

/** The lines, without the blank ones trailing them. */
function trimBlank(lines: string[]): string[] {
  const trimmed = [...lines];

  while (trimmed.at(-1)?.trim() === "") {
    trimmed.pop();
  }

  return trimmed;
}

function callsIn(body: string[] | undefined): string | undefined {
  for (const line of body ?? []) {
    const match = /^\s*calls:\s*(\S+)\s*$/.exec(line);

    if (match) {
      return match[1];
    }
  }

  return undefined;
}

/**
 * What goes under a job.
 *
 * A call is read straight off the workflow file, since its `uses:` is the only
 * thing that decides it. Everything else is whatever the config already said,
 * copied across untouched — that is the part a person wrote, and a sync that
 * quietly dropped it would turn a careful path filter into "always runs"
 * without anyone noticing.
 */
function jobLines(
  job: string,
  calls: string | undefined,
  existing: JobText | undefined,
): string[] {
  const key = `${" ".repeat(JOB_INDENT)}${job}:`;

  if (calls !== undefined) {
    return [key, `${" ".repeat(JOB_INDENT + 2)}calls: ${calls}`];
  }

  const { inline = "", body = [] } = existing ?? {};

  return [
    inline === "" ? key : `${key} ${inline}`,
    // A job that no longer calls anything keeps its conditions but not the call.
    ...body.filter((line) => !/^\s*calls:\s/.test(line)),
  ];
}

/** The `workflows:` block, as the config file spells it. */
export function renderWorkflows(scaffold: Scaffold, config = ""): string {
  const existing = existingConfig(config);

  const blocks = Object.entries(scaffold).map(([workflow, jobs]) => {
    const before = existing[workflow];
    // The workflow's own conditions are written by hand, like a job's, so they
    // are copied across rather than regenerated.
    const lines = [
      `${" ".repeat(WORKFLOW_INDENT)}${workflow}:`,
      ...(before?.blocks ?? []),
    ];

    // A workflow whose every job is the plan's own machinery has nothing for
    // the config to decide, but it is still a workflow, and `jobs` is required.
    if (jobs.length === 0) {
      return [...lines, `${" ".repeat(WORKFLOW_INDENT + 2)}jobs: {}`].join(
        "\n",
      );
    }

    lines.push(`${" ".repeat(WORKFLOW_INDENT + 2)}jobs:`);

    for (const { job, calls } of jobs) {
      lines.push(...jobLines(job, calls, before?.jobs[job]));
    }

    return lines.join("\n");
  });

  return ["workflows:", blocks.join("\n\n")].join("\n");
}

/** The config with `workflows:` replaced, or given one if it had none. */
export function withWorkflows(config: string, block: string): string {
  const lines = config.split("\n");
  const section = workflowsSection(lines);

  if (!section) {
    const before = config.trimEnd();

    return before.length === 0 ? `${block}\n` : `${before}\n\n${block}\n`;
  }

  return [
    ...lines.slice(0, section.start),
    ...block.split("\n"),
    ...lines.slice(section.end),
  ].join("\n");
}

/**
 * What the sync did to the config, a line per job. Nothing else reports this:
 * the conditions are kept verbatim, so a job appearing or disappearing is the
 * whole of what changed, and it is the thing worth reading before committing.
 */
export function describeSync(
  scaffold: Scaffold,
  existing: ExistingConfig,
): string[] {
  const changes: string[] = [];

  for (const [workflow, jobs] of Object.entries(scaffold)) {
    const before = existing[workflow];

    if (!before) {
      changes.push(`+ workflow ${workflow}`);
    }

    for (const { job, calls } of jobs) {
      const text = before?.jobs[job];

      if (text === undefined) {
        changes.push(`+ job ${workflow}/${job}`);
        continue;
      }

      const was = callsIn(text.body);

      if (was !== calls) {
        changes.push(
          `~ job ${workflow}/${job} ${calls ? `now calls ${calls}` : "no longer calls anything"}`,
        );
      }
    }

    for (const job of Object.keys(before?.jobs ?? {})) {
      if (!jobs.some((entry) => entry.job === job)) {
        changes.push(`- job ${workflow}/${job}`);
      }
    }
  }

  for (const workflow of Object.keys(existing)) {
    if (!scaffold[workflow]) {
      changes.push(`- workflow ${workflow}`);
    }
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Creating a plan
// ---------------------------------------------------------------------------

/** A settled answer: what was decided, and what to blame it on. */
export type Decision = { id: string; run: boolean; reason: string };

/**
 * The first override whose `run` or `skip` matches, which then applies to
 * every job in every workflow — an override outranks everything a workflow
 * says about itself, `force-skip` included. The one way out is for a block to
 * name it in `ignore-overrides`.
 *
 * It is tested against the context alone: `paths` is barred from an override
 * at parse time, so the empty diff handed in here is never consulted.
 */
export function selectOverride(
  config: PlanConfig,
  context: PlanContext,
): Decision | null {
  const facts: Facts = { ...context, changedGroups: [] };

  for (const override of config.overrides) {
    const verdict = weigh(override, facts);

    if (verdict) {
      return { id: override.id, run: verdict.run, reason: override.reason };
    }
  }

  return null;
}

/**
 * What one set of blocks decides, on the ladder, before anything outside them
 * is taken into account.
 *
 * A job and the workflow holding it are read the same way — same blocks, same
 * order, same reasons — and differ only in `unconditional`, what it means to
 * have said nothing at all.
 */
function decide(
  blocks: Blocks,
  facts: Facts,
  override: Decision | null,
  unconditional: string,
): JobPlan {
  // Overrides always take precedence over every workflow level setting, which
  // is the outer rule: `force-skip` tops the ladder below, not this. The one
  // way out is a block naming the override in `ignore-overrides`, which sits
  // this job out of it and leaves it decided by its own conditions.
  const sittingOut = override !== null && ignoresOverride(blocks, override.id);

  if (override && !sittingOut) {
    return { run: override.run, reason: override.reason };
  }

  // Said once at the end rather than folded into each reason, so a reason
  // still reads as the condition that settled it.
  const aside = sittingOut ? ` (ignoring the ${override?.id} override)` : "";
  const verdict = weigh(blocks, facts);

  if (verdict) {
    const reason = `${verdict.block} condition met: ${describeMatched(verdict.condition, verdict.hits, facts)}`;
    const loser = overruled(blocks, verdict, facts);

    return {
      run: verdict.run,
      reason:
        (loser
          ? `${reason} (which beats the matching ${loser} condition)`
          : reason) + aside,
    };
  }

  // A `run:` block is the condition for running, so failing to match it is a
  // skip. With no `run:` block at all there was never anything to satisfy.
  if (blocks.run) {
    return {
      run: false,
      reason: `no run condition met: ${describeCondition(blocks.run)}${aside}`,
    };
  }

  return { run: true, reason: unconditional + aside };
}

export function planJob(
  options: JobConfig,
  facts: Facts,
  override: Decision | null,
): JobPlan {
  return decide(options, facts, override, "no conditions, always runs");
}

/**
 * Whether a workflow's own conditions let its jobs be considered at all.
 *
 * This is only ever a veto. An open gate hands each job back its own question,
 * so a workflow saying `run: paths: backend_all` does not drag every job in it
 * along with the backend — it stops asking them anything when the backend is
 * untouched, and otherwise leaves them exactly as they were.
 */
export function gateWorkflow(
  config: WorkflowConfig,
  facts: Facts,
  override: Decision | null = null,
): JobPlan {
  return decide(config, facts, override, "no workflow conditions");
}

/** The id the plan carries when everything ran because the diff failed. */
export const DIFF_FAILED = "diff-failed";

/**
 * The blanket decision taken when we cannot tell what changed.
 *
 * Nothing in the config can express this, because it is not a property of the
 * inputs: it is what is left when git or the API will not answer. A push that
 * creates a branch (whose `before` is all zeroes), a force-push that left the
 * base pointing at a commit nobody has any more, a clone too shallow to reach
 * it — all of them land here and all of them mean the same thing. Running
 * everything is the only honest answer, since the alternative is skipping jobs
 * on no evidence at all.
 */
const diffFailed: Decision = {
  id: DIFF_FAILED,
  run: true,
  reason: "could not work out what changed, so everything runs",
};

/**
 * Plans every workflow, and a called one before its caller.
 *
 * Calls are what let one config govern workflows that call each other. A
 * calling job takes the answer the called workflow arrived at, which is the
 * same "is there real work here?" rule a top-level workflow uses, so a nested
 * job's path filter reaches all the way up and there is one place to look to
 * see why any of it ran.
 *
 * Conditions on the calling job are the `if:` on the call, and so gate the
 * called workflow from above — everything in it is held back when the call is.
 * That is the one thing a called workflow cannot say for itself: its own gate
 * is shared by its jobs, but only the caller knows whether entering it was
 * worth it at all.
 */
function planWorkflows(
  config: PlanConfig,
  facts: Facts,
  override: Decision | null,
): Record<string, WorkflowPlan> {
  const planned: Record<string, WorkflowPlan> = {};
  const calling: string[] = [];

  /** The call that reached this workflow, for a workflow that was called. */
  type Call = { workflow: string; job: string; plan: JobPlan };

  const planWorkflow = (workflow: string, call?: Call): WorkflowPlan => {
    const done = planned[workflow];

    if (done) {
      return done;
    }

    if (calling.includes(workflow)) {
      throw new Error(
        `workflow "${workflow}" ends up calling itself: ${[...calling, workflow].join(" -> ")}`,
      );
    }

    const workflowConfig = config.workflows[workflow];

    if (!workflowConfig) {
      throw new Error(
        `workflow "${workflow}" is called but not described in the config`,
      );
    }

    calling.push(workflow);

    // An override settles every job in every workflow on its own, so there is
    // nothing left for a gate to hold back and neither gate is consulted --
    // unless this workflow's own blocks sit that override out, in which case
    // its gate is asked exactly as it would be on an ordinary run.
    const settled =
      override !== null && !ignoresOverride(workflowConfig, override.id);

    const gate = settled ? null : gateWorkflow(workflowConfig, facts, override);

    // The call is the outer gate: a workflow nobody called runs none of its
    // jobs, whatever its own gate would have allowed.
    const closed = settled
      ? null
      : call && !call.plan.run
        ? `the ${call.workflow} workflow does not call it: ${call.plan.reason}`
        : gate && !gate.run
          ? gate.reason
          : null;

    const jobs: Record<string, JobPlan> = {};

    for (const [job, options] of Object.entries(workflowConfig.jobs)) {
      // Named so the reason reads the same wherever the job is looked up,
      // rather than making sense only next to the workflow it belongs to.
      const own = closed
        ? { run: false, reason: `the ${workflow} workflow is skipped: ${closed}` }
        : planJob(options, facts, override);

      if (options.calls === undefined) {
        jobs[job] = own;
        continue;
      }

      // A call is planned even when this workflow is closed, so that the
      // whole subtree below it is marked skipped for the same reason rather
      // than being planned later as though nobody had called it.
      const called = planWorkflow(options.calls, { workflow, job, plan: own });

      // The job's own blocks decide whether the call happens; what is left
      // inside the called workflow decides whether the job has anything to do.
      jobs[job] = closed ? own : planCall(options.calls, called);
    }

    calling.pop();

    const run = Object.values(jobs).some((plan) => plan.run);

    const workflowPlan: WorkflowPlan = {
      run,
      reason:
        closed ?? (run ? "a job in it has work to do" : "no job in it has work to do"),
      jobs,
    };

    planned[workflow] = workflowPlan;

    return workflowPlan;
  };

  // A called workflow has to be planned through the call that gates it, so the
  // workflows nobody calls go first and everything else is reached from one of
  // them. Reported in the order the config lists them all the same, so reading
  // a plan follows the same path as reading the file it came from.
  const called = callSites(config.workflows);

  for (const workflow of Object.keys(config.workflows)) {
    if (!called[workflow]) {
      planWorkflow(workflow);
    }
  }

  return Object.fromEntries(
    Object.keys(config.workflows).map((workflow) => [
      workflow,
      planWorkflow(workflow),
    ]),
  );
}

function planCall(workflow: string, called: WorkflowPlan): JobPlan {
  return called.run
    ? { run: true, reason: `the ${workflow} workflow has jobs to run` }
    : { run: false, reason: `nothing to run in the ${workflow} workflow` };
}

/** True when anything in the config sits the named override out. */
function anythingIgnores(config: PlanConfig, id: string): boolean {
  return Object.values(config.workflows).some(
    (workflow) =>
      ignoresOverride(workflow, id) ||
      Object.values(workflow.jobs).some((job) => ignoresOverride(job, id)),
  );
}

/**
 * `diff` is a thunk because an override usually settles every job on its own:
 * on a protected branch, or behind force-run or skip-all, there is no question
 * left for the diff to answer, so it is never asked. When it is asked and
 * throws, that is not an error to fail the run with — it is the diff-failed
 * decision.
 *
 * A block that sits the override out is the exception. It is decided from its
 * own conditions, and those may include `paths:`, so the diff has to be worked
 * out after all. A diff that then fails is not the diff-failed decision — the
 * override already settled everything else, and everything that sat it out is
 * left with no changed groups, which is the same answer it would have had.
 */
export function createPlan(
  config: PlanConfig,
  context: PlanContext,
  diff: () => PlanDiff,
): TestPlan {
  let override = selectOverride(config, context);
  let changes: PlanDiff | null = null;

  if (!override) {
    try {
      changes = diff();
    } catch {
      override = diffFailed;
    }
  } else if (anythingIgnores(config, override.id)) {
    try {
      changes = diff();
    } catch {
      changes = null;
    }
  }

  const workflows = planWorkflows(
    config,
    { ...context, changedGroups: changes?.changedGroups ?? [] },
    override,
  );

  return {
    version: PLAN_VERSION,
    createdAt: new Date().toISOString(),
    inputs: {
      ...context,
      changedFiles: changes?.changedFiles ?? null,
      changedGroups: changes?.changedGroups ?? null,
    },
    override: override?.id ?? null,
    workflows,
  };
}

/**
 * How big a plan may get. GitHub caps a job output at 1 MB, and the plan is a
 * job output before it is anything else — `ci` publishes it, every `if:` reads
 * it back out of `needs`, and each called workflow takes it as a `workflow_call`
 * input on top of that.
 */
export const MAX_PLAN_BYTES = 1024 * 1024;

function describeBytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(bytes < 1024 * 10 ? 1 : 0)} KB`;
}

/**
 * Turns a plan into the string CI passes around, refusing one too big to make
 * the trip.
 *
 * Failing here is the point. A plan that does not arrive intact does not fail
 * loudly at the far end: `fromJSON` cannot read it, every `if:` that consults
 * it comes out false, and the run quietly skips everything while reporting
 * success. Better to have no plan and say why than a plan nobody can read.
 */
export function serializePlan(
  plan: TestPlan,
  max: number = MAX_PLAN_BYTES,
): string {
  const json = JSON.stringify(plan);
  const bytes = new TextEncoder().encode(json).length;

  if (bytes > max) {
    throw new Error(
      `The plan is ${describeBytes(bytes)}, over the ${describeBytes(max)} a job output can carry.`,
    );
  }

  return json;
}

// ---------------------------------------------------------------------------
// Reading a plan
// ---------------------------------------------------------------------------

export function parsePlan(source: string): TestPlan {
  const trimmed = source.trim();

  if (trimmed.length === 0) {
    throw new Error(
      "the plan is empty — the job that creates it probably failed",
    );
  }

  // JSON.parse is untyped; the version check below is what vets the shape.
  const plan = JSON.parse(trimmed) as TestPlan;

  if (plan.version !== PLAN_VERSION) {
    throw new Error(
      `plan version ${plan.version} is not supported, expected ${PLAN_VERSION}`,
    );
  }

  return plan;
}

export function lookupWorkflow(plan: TestPlan, workflow: string): WorkflowPlan {
  const found = plan.workflows[workflow];

  if (!found) {
    throw new Error(
      `the plan has no workflow "${workflow}", only ${Object.keys(plan.workflows).join(", ")}`,
    );
  }

  return found;
}

export function lookupJob(
  plan: TestPlan,
  workflow: string,
  job: string,
): JobPlan {
  const found = lookupWorkflow(plan, workflow).jobs[job];

  if (!found) {
    throw new Error(
      `the plan has no job "${workflow}/${job}", only ${Object.keys(lookupWorkflow(plan, workflow).jobs).join(", ")}`,
    );
  }

  return found;
}

// ---------------------------------------------------------------------------
// Verifying a finished run
// ---------------------------------------------------------------------------

export type JobResult = { result?: string };
export type Results = Record<string, JobResult>;

export type Check = {
  job: string;
  expected: "run" | "skip";
  result: string;
  ok: boolean;
  detail: string;
};

/**
 * Compares what the plan asked for against what the run actually did.
 *
 * A planned job has to have succeeded. A job the plan skipped has to have been
 * skipped: if it ran anyway the plan and the workflow have drifted apart, and
 * that is worth failing on even when the job passed.
 *
 * Only the jobs the plan names are checked, in both directions — the job doing
 * the verifying, and anything else the plan does not govern, is not in its own
 * `needs` and so never shows up in `results` to begin with.
 */
export function verifyPlan(
  plan: TestPlan,
  workflow: string,
  results: Results,
): Check[] {
  const jobs = lookupWorkflow(plan, workflow).jobs;
  const checks: Check[] = [];

  for (const [job, jobPlan] of Object.entries(jobs)) {
    const result = results[job]?.result ?? "missing";

    if (jobPlan.run) {
      checks.push({
        job,
        expected: "run",
        result,
        ok: result === "success",
        detail:
          result === "success"
            ? jobPlan.reason
            : result === "missing"
              ? "planned to run but is not in `needs` — wire it into the verify job"
              : `planned to run (${jobPlan.reason}) but ${result}`,
      });
      continue;
    }

    checks.push({
      job,
      expected: "skip",
      result,
      ok: result === "skipped" || result === "missing",
      detail:
        result === "skipped" || result === "missing"
          ? jobPlan.reason
          : `planned to be skipped (${jobPlan.reason}) but ${result}`,
    });
  }

  for (const job of Object.keys(results)) {
    if (!(job in jobs)) {
      checks.push({
        job,
        expected: "skip",
        result: results[job]?.result ?? "missing",
        ok: false,
        detail: `ran but is not in the plan — add it to .github/test-plan.yaml`,
      });
    }
  }

  return checks;
}

// ---------------------------------------------------------------------------
// Input resolution
// ---------------------------------------------------------------------------

function run(program: string, args: string[]): string {
  const result = spawnSync(program, args, {
    encoding: "utf8",
    // gh writes a plan-sized diff, which overruns the 1 MB default.
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(
      `${[program, ...args].join(" ")} failed: ${result.stderr.trim()}`,
    );
  }

  return result.stdout;
}

type PullRequest = {
  headRefName: string;
  baseRefName: string;
  isDraft: boolean;
  labels: { name: string }[];
};

/** A context, and a way to get the diff if it turns out to be needed. */
type Source = { context: PlanContext; diff: () => PlanDiff };

function pullRequestSource(
  number: string,
  repo: string | undefined,
  toDiff: (files: string[]) => PlanDiff,
  /** Extra labels to pretend the pull request carries, from --label. */
  extraLabels: string[],
): Source {
  const scope = repo ? ["--repo", repo] : [];
  // The fields gh was asked for, which is what --json guarantees it returns.
  const view = JSON.parse(
    run("gh", [
      "pr",
      "view",
      number,
      ...scope,
      "--json",
      "headRefName,baseRefName,isDraft,labels",
    ]),
  ) as PullRequest;

  return {
    context: {
      event: "pull_request",
      // The branch under test, which `branch` conditions match against — for
      // a pull request that is the head, not the branch it will merge into.
      ref: view.headRefName,
      baseRef: view.baseRefName,
      draft: view.isDraft,
      // The API is the source of truth, so a re-run picks up a label added
      // since the run started. --label adds to that, which is how you ask
      // "what would CI do if I labelled this?" without labelling it.
      labels: [
        ...new Set([...view.labels.map((label) => label.name), ...extraLabels]),
      ],
    },
    // A second round trip to the API, so it only happens when it has to.
    diff: () =>
      toDiff(
        run("gh", ["pr", "diff", number, ...scope, "--name-only"])
          .split("\n")
          .filter((line) => line.length > 0),
      ),
  };
}

/**
 * The branch under test.
 *
 * This is deliberately not derived from --head: --head says what to diff, and
 * it is routinely a bare sha, which has no branch name to abbreviate. Asking
 * git for one anyway returns an empty string, and an empty ref is the worst
 * possible answer — every `branch:` condition quietly stops matching, so a run
 * on master plans itself as though it were on a feature branch. CI already
 * knows the answer and puts it in GITHUB_REF_NAME; a laptop has a checked-out
 * branch. Failing to find either is worth saying out loud.
 */
function currentBranch(): string {
  const fromEnv = process.env.GITHUB_REF_NAME;

  if (fromEnv) {
    return fromEnv;
  }

  const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]).trim();

  // A detached HEAD abbreviates to the word "HEAD", which names no branch.
  if (branch === "" || branch === "HEAD") {
    throw new Error(
      "could not work out the branch under test — pass --ref, or set GITHUB_REF_NAME",
    );
  }

  return branch;
}

function localSource(
  options: Options,
  toDiff: (files: string[]) => PlanDiff,
): Source {
  const head = one(options, "head") ?? "HEAD";
  // An empty --base is treated as absent, since that is what a workflow passes
  // for an event with no `before` at all. A base that is present but useless —
  // the all-zero commit a branch-creating push reports, say — is left alone on
  // purpose: the diff against it fails, and everything runs.
  const base = one(options, "base") || defaultBase(head);
  const ref = one(options, "ref") ?? currentBranch();

  return {
    context: {
      event: one(options, "event") ?? "push",
      ref,
      baseRef: one(options, "base-ref") ?? null,
      draft: false,
      labels: many(options, "label"),
    },
    diff: () => toDiff(changedFiles(base, head)),
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export type Options = Record<string, string[]>;

/**
 * The flags that are simply on or off, and so take no value. Everything else
 * needs one, which is what turns a typo like `--pr --repo x` into an error
 * rather than a plan for the pull request named "--repo".
 */
const SWITCHES = new Set(["write"]);

export function parseArgs(argv: string[]): Options {
  const options: Options = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === undefined || !arg.startsWith("--")) {
      throw new Error(`expected a --flag, got "${arg}"`);
    }

    const [flag, inlineValue] = splitFlag(arg.slice(2));

    if (SWITCHES.has(flag)) {
      if (inlineValue !== undefined) {
        throw new Error(`--${flag} takes no value`);
      }

      options[flag] = ["true"];
      continue;
    }

    const value = inlineValue ?? argv[++i];

    if (value === undefined) {
      throw new Error(`--${flag} needs a value`);
    }

    const existing = options[flag] ?? [];

    existing.push(value);
    options[flag] = existing;
  }

  return options;
}

function splitFlag(flag: string): [string, string | undefined] {
  const equals = flag.indexOf("=");

  return equals === -1
    ? [flag, undefined]
    : [flag.slice(0, equals), flag.slice(equals + 1)];
}

function one(options: Options, flag: string): string | undefined {
  const values = options[flag];

  if (values && values.length > 1) {
    throw new Error(`--${flag} was given more than once`);
  }

  return values?.[0];
}

/** Every value given for a repeatable flag, in the order they were given. */
function many(options: Options, flag: string): string[] {
  return options[flag] ?? [];
}

/** Whether a switch was given at all, which is the whole of what it says. */
function enabled(options: Options, flag: string): boolean {
  return options[flag] !== undefined;
}

function required(options: Options, flag: string): string {
  const value = one(options, flag);

  if (value === undefined) {
    throw new Error(`--${flag} is required`);
  }

  return value;
}

/** A file, or standard input when the location is `-`. */
function readSource(location: string): string {
  return readFileSync(location === "-" ? 0 : location, "utf8");
}

/** Job outputs survive newlines only via the heredoc form. */
function writeOutput(name: string, value: string): void {
  const path = process.env.GITHUB_OUTPUT;

  if (!path) {
    return;
  }

  const delimiter = `EOF_${randomUUID().replaceAll("-", "")}`;

  appendFileSync(path, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

function appendSummary(markdown: string): void {
  const path = process.env.GITHUB_STEP_SUMMARY;

  if (!path) {
    return;
  }

  appendFileSync(path, markdown);
}

/** What the diff said, or why the plan has none to show. */
function describeChanges(plan: TestPlan): string {
  const { changedFiles, changedGroups } = plan.inputs;

  if (changedGroups === null) {
    return `(no diff — ${plan.override} decides)`;
  }

  return `${changedGroups.join(", ") || "(no matching groups)"} (${changedFiles?.length ?? 0} file(s))`;
}

function describePlan(plan: TestPlan): string {
  const lines: string[] = [];
  const { inputs } = plan;

  lines.push(`event:    ${inputs.event}`);
  lines.push(
    `ref:      ${inputs.ref}${inputs.baseRef ? ` -> ${inputs.baseRef}` : ""}`,
  );
  lines.push(`labels:   ${inputs.labels.join(", ") || "(none)"}`);
  lines.push(`changed:  ${describeChanges(plan)}`);
  lines.push(`override: ${plan.override ?? "(none)"}`);
  lines.push("");

  // Padded to the longest name there actually is, so the reasons line up
  // rather than being pushed out of true by one long job name.
  const width = Math.max(
    ...Object.values(plan.workflows).flatMap((workflowPlan) =>
      Object.keys(workflowPlan.jobs).map((job) => job.length),
    ),
    0,
  );

  for (const [workflow, workflowPlan] of Object.entries(plan.workflows)) {
    lines.push(
      `${workflowPlan.run ? "RUN " : "SKIP"} ${workflow.padEnd(width - 2)} ${workflowPlan.reason}`,
    );

    for (const [job, jobPlan] of Object.entries(workflowPlan.jobs)) {
      lines.push(
        `  ${jobPlan.run ? "RUN " : "SKIP"} ${job.padEnd(width)} ${jobPlan.reason}`,
      );
    }
  }

  return lines.join("\n");
}

async function createCommand(options: Options): Promise<number> {
  const configPath = one(options, "config") ?? ".github/test-plan.yaml";
  const filtersPath = one(options, "filters") ?? ".github/file-paths.yaml";

  const config = parseConfig(readFileSync(configPath, "utf8"));
  const filters = parseFilters(readFileSync(filtersPath, "utf8"));

  validateGroups(config, Object.keys(filters));

  const toDiff = (files: string[]): PlanDiff => ({
    changedFiles: files,
    changedGroups: matchGroups(filters, files),
  });

  const pr = one(options, "pr");
  const { context, diff } = pr
    ? pullRequestSource(
        pr,
        one(options, "repo"),
        toDiff,
        many(options, "label"),
      )
    : localSource(options, toDiff);

  const plan = createPlan(config, context, diff);
  const json = serializePlan(plan);

  if (one(options, "format") !== "json") {
    console.log(describePlan(plan));
  } else {
    console.log(json);
  }

  const out = one(options, "out");

  if (out) {
    writeFileSync(out, `${json}\n`);
  }

  writeOutput("plan", json);
  appendSummary(`## Test plan\n\n\`\`\`\n${describePlan(plan)}\n\`\`\`\n`);

  return 0;
}

async function executeCommand(options: Options): Promise<number> {
  const plan = parsePlan(readSource(required(options, "plan")));
  const workflow = required(options, "workflow");
  const job = one(options, "job");

  const decision = job
    ? lookupJob(plan, workflow, job)
    : lookupWorkflow(plan, workflow);

  console.log(String(decision.run));
  console.error(
    `${workflow}${job ? `/${job}` : ""}: ${decision.run ? "run" : "skip"} (${decision.reason})`,
  );

  writeOutput("run", String(decision.run));

  return 0;
}

/** The directory a workflow file sits in, and the name it goes by. */
function workflowLocation(path: string): { dir: string; name: string } {
  const slash = path.lastIndexOf("/");
  const dir = slash === -1 ? "." : path.slice(0, slash);
  const file = path.slice(slash + 1);
  const name = file.replace(/\.ya?ml$/, "");

  if (name === file) {
    throw new Error(`--workflow must be a .yml or .yaml file, got "${path}"`);
  }

  return { dir, name };
}

/**
 * Reads a called workflow by name. A `uses:` names a file, but the config, the
 * plan and every error in them name a workflow, so the name is what travels
 * and the extension is looked for here.
 */
function workflowReader(dir: string): (workflow: string) => Promise<string> {
  return async (workflow) => {
    for (const extension of [".yml", ".yaml"]) {
      const path = `${dir}/${workflow}${extension}`;

      if (existsSync(path)) {
        return readFileSync(path, "utf8");
      }
    }

    throw new Error(`no ${dir}/${workflow}.yml to read workflow "${workflow}"`);
  };
}

async function syncCommand(options: Options): Promise<number> {
  const configPath = one(options, "config") ?? ".github/test-plan.yaml";
  const { dir, name } = workflowLocation(required(options, "workflow"));

  const scaffold = await scaffoldWorkflows(name, workflowReader(dir));
  const config = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  const updated = withWorkflows(config, renderWorkflows(scaffold, config));

  // A sync that produced a config nobody can read would be found out by the
  // next run rather than by the person doing the syncing.
  parseConfig(updated);

  const changes = describeSync(scaffold, existingConfig(config));

  console.error(changes.length > 0 ? changes.join("\n") : "already in sync");

  if (!enabled(options, "write")) {
    console.log(updated.trimEnd());
    return 0;
  }

  if (updated === config) {
    console.log(`${configPath} is already up to date`);
    return 0;
  }

  writeFileSync(configPath, updated);
  console.log(`wrote ${configPath}`);

  return 0;
}

async function verifyCommand(options: Options): Promise<number> {
  const plan = parsePlan(readSource(required(options, "plan")));
  const workflow = required(options, "workflow");

  const resultsSource =
    one(options, "results") ?? readSource(required(options, "results-file"));
  const checks = verifyPlan(
    plan,
    workflow,
    // The `needs` context, whose shape GitHub fixes: job name to { result }.
    JSON.parse(resultsSource) as Results,
  );

  const width = Math.max(...checks.map((check) => check.job.length), 0);
  const lines = checks.map(
    (check) =>
      `${check.ok ? "PASS" : "FAIL"} ${check.job.padEnd(width)} ${check.result.padEnd(9)} ${check.detail}`,
  );
  const failed = checks.filter((check) => !check.ok);

  console.log(lines.join("\n"));
  console.log(
    failed.length === 0
      ? `\nAll ${checks.length} job(s) matched the plan.`
      : `\n${failed.length} of ${checks.length} job(s) did not match the plan.`,
  );

  appendSummary(`## Required check\n\n\`\`\`\n${lines.join("\n")}\n\`\`\`\n`);

  return failed.length === 0 ? 0 : 1;
}

/**
 * A command, and everything `--help` says about it. Keeping the help next to
 * the handler is what stops the two drifting apart: a new flag that goes
 * undocumented is visible in the same object it was added to.
 */
export type Command = {
  run: (options: Options) => Promise<number>;
  /** One line, for the command list in the top-level help. */
  summary: string;
  /** What follows `test-plan.ts <name>` in the usage line. */
  args: string;
  /** A paragraph or two on what the command is for, wrapped at 76 columns. */
  description: string[];
  /** Every flag the command reads, with its default where it has one. */
  flags: [flag: string, description: string][];
  /** Worked invocations, the kind you would actually type. */
  examples: string[];
};

export const COMMANDS: Record<string, Command> = {
  create: {
    run: createCommand,
    summary: "work out which workflows and jobs should run",
    args: "[--pr <n> | --event <e> --ref <r>] [options]",
    description: [
      "Resolves its inputs from a pull request (--pr, via gh) or from the",
      "flags and the local git repository, so the same command run on a",
      "laptop and in CI produces the same plan. Prints the plan, and writes",
      "it to the `plan` job output when GITHUB_OUTPUT is set.",
    ],
    flags: [
      ["--pr <n>", "plan pull request <n>: its branch, draft state and labels"],
      ["--repo <owner/name>", "repository --pr belongs to (default: current)"],
      ["--event <name>", "event to plan for, without --pr (default: push)"],
      ["--ref <name>", "branch under test (default: the branch at --head)"],
      [
        "--base <ref>",
        "what to diff against (default: the commit before --head)",
      ],
      ["--head <ref>", "what to diff (default: HEAD)"],
      ["--base-ref <name>", "branch being merged into, recorded in the plan"],
      ["--label <name>", "add a label to the context; repeatable"],
      ["--config <path>", "plan config (default: .github/test-plan.yaml)"],
      ["--filters <path>", "path groups (default: .github/file-paths.yaml)"],
      ["--out <path>", "also write the plan JSON to <path>"],
      ["--format json|text", "how to print the plan (default: text)"],
    ],
    examples: [
      "test-plan.ts create --pr 9",
      "test-plan.ts create --pr 9 --label force-run",
      "test-plan.ts create --event push --ref main --format json",
      "test-plan.ts create --base origin/main --head HEAD --out plan.json",
    ],
  },
  execute: {
    run: executeCommand,
    summary: "ask the plan whether one workflow or job runs",
    args: "--plan <path|-> --workflow <w> [--job <j>]",
    description: [
      "Prints `true` or `false` on stdout and the reason on stderr, and",
      "writes the answer to the `run` job output when GITHUB_OUTPUT is set.",
      "Without --job it answers for the workflow as a whole.",
    ],
    flags: [
      ["--plan <path|->", "the plan, as a file or `-` for stdin"],
      ["--workflow <name>", "the workflow to ask about"],
      ["--job <name>", "a job inside it (default: the workflow itself)"],
    ],
    examples: [
      "test-plan.ts execute --plan plan.json --workflow ci",
      "test-plan.ts execute --plan - --workflow lint --job lint",
    ],
  },
  sync: {
    run: syncCommand,
    summary: "make the config's `workflows:` match the workflow files",
    args: "--workflow <path> [--config <path>] [--write]",
    description: [
      "Reads a workflow file and every workflow it calls, however deep the",
      "calls go, and writes out the `workflows:` block they describe: each",
      "job, and, for a job that is a call, the workflow it calls. Conditions",
      "already in the config are kept exactly as they are, comments and all,",
      "a workflow's own gate included — the workflow files say what jobs",
      "there are, and you say when they",
      "run. The jobs that build the plan and check it afterwards are left",
      "out, since the plan cannot govern them. Prints the updated config,",
      "and lists what changed on stderr.",
    ],
    flags: [
      ["--workflow <path>", "the workflow to read, with its calls followed"],
      ["--config <path>", "plan config (default: .github/test-plan.yaml)"],
      ["--write", "update the config in place instead of printing it"],
    ],
    examples: [
      "test-plan.ts sync --workflow .github/workflows/ci.yml",
      "test-plan.ts sync --workflow .github/workflows/ci.yml --write",
    ],
  },
  verify: {
    run: verifyCommand,
    summary: "check a finished run did what the plan asked for",
    args: "--plan <path|-> --workflow <w> (--results <json> | --results-file <path|->)",
    description: [
      "The required check. Takes the plan and the `needs` context and",
      "confirms every job the plan asked for ran and passed, and every job",
      "it ruled out was skipped. Exits non-zero when they disagree.",
    ],
    flags: [
      ["--plan <path|->", "the plan, as a file or `-` for stdin"],
      ["--workflow <name>", "the workflow whose jobs to check"],
      ["--results <json>", "the `needs` context, as JSON"],
      ["--results-file <path|->", "the same, read from a file or stdin"],
    ],
    examples: [
      'test-plan.ts verify --plan plan.json --workflow ci --results "$RESULTS"',
      "printf '%s' \"$PLAN\" | test-plan.ts verify --plan - --workflow ci \\",
      "  --results-file results.json",
    ],
  },
};

/** The command list, for `--help` with no command given. */
function overviewHelp(): string {
  const width = Math.max(...Object.keys(COMMANDS).map((name) => name.length));

  return [
    "test-plan.ts — build and read the CI test plan.",
    "",
    "usage: test-plan.ts <command> [options]",
    "",
    "commands:",
    ...Object.entries(COMMANDS).map(
      ([name, command]) => `  ${name.padEnd(width)}  ${command.summary}`,
    ),
    "",
    "Run `test-plan.ts <command> --help` for a command's options.",
  ].join("\n");
}

/** Everything about one command, for `<command> --help`. */
function commandHelp(name: string): string {
  const command = requireCommand(name);
  const width = Math.max(...command.flags.map(([flag]) => flag.length));

  return [
    `test-plan.ts ${name} — ${command.summary}.`,
    "",
    `usage: test-plan.ts ${name} ${command.args}`,
    "",
    ...command.description,
    "",
    "options:",
    ...command.flags.map(
      ([flag, description]) => `  ${flag.padEnd(width)}  ${description}`,
    ),
    "",
    "examples:",
    ...command.examples.map((example) => `  ${example}`),
  ].join("\n");
}

function requireCommand(name: string): Command {
  const command = COMMANDS[name];

  if (!command) {
    throw new Error(`unknown command "${name}"`);
  }

  return command;
}

/** `--help` and `-h` take no value, so they never reach parseArgs. */
function wantsHelp(argv: string[]): boolean {
  return argv.includes("--help") || argv.includes("-h");
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);

  // `help`, `help <command>`, `--help`, `-h` — all the spellings people try.
  if (command === "help" || command === undefined || wantsHelp([command])) {
    const topic = command === "help" ? rest[0] : undefined;

    if (topic !== undefined && !(topic in COMMANDS)) {
      console.error(`unknown command "${topic}"\n\n${overviewHelp()}`);
      return 2;
    }

    // No arguments at all is a misuse rather than a question, so the help
    // goes to stderr and the exit code says something was wrong.
    if (command === undefined) {
      console.error(overviewHelp());
      return 2;
    }

    console.log(topic === undefined ? overviewHelp() : commandHelp(topic));
    return 0;
  }

  if (!(command in COMMANDS)) {
    console.error(`unknown command "${command}"\n\n${overviewHelp()}`);
    return 2;
  }

  if (wantsHelp(rest)) {
    console.log(commandHelp(command));
    return 0;
  }

  return await requireCommand(command).run(parseArgs(rest));
}

// Bun sets import.meta.main; the repository's TypeScript is configured for
// Node, whose ImportMeta does not declare it.
if ((import.meta as ImportMeta & { main?: boolean }).main) {
  try {
    process.exit(await main());
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}
