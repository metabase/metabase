import * as Lib from "metabase-lib";
import type { RowValues } from "metabase-types/api";

import { enumerateCandidates } from "./candidates";
import { buildProfileInputs, isNativeInput } from "./column-source";
import { THRESH } from "./constants";
import { pickAlternatives, rankCandidates } from "./penalties";
import { profileColumns, promoteAggregatedIfGroupedKey } from "./profile";
import { reconcile } from "./reconcile";
import { columnMappingNames, settingsFor } from "./settings";
import { type ShapeContext, summarizeShape } from "./shape";
import {
  computeConfidence,
  computeRowStats,
  provisionalReasons,
  refineProfiles,
  ruleFactor,
} from "./stage2";
import type {
  Alternative,
  ColumnProfile,
  Decision,
  DefaultVizInput,
  ProfileContext,
  RowStats,
  ScoredCandidate,
  Shape,
  StageTimings,
  TwoStageDecision,
  TwoStageTimings,
} from "./types";

export type * from "./types";
export { reconcile } from "./reconcile";

const now = (): number => performance.now();

function aggregatedPrior(input: DefaultVizInput, isNative: boolean): boolean {
  if (isNative) {
    return input.native?.aggregated ?? false;
  }
  return (
    Lib.aggregations(input.query, input.stageIndex).length > 0 ||
    Lib.breakouts(input.query, input.stageIndex).length > 0
  );
}

function profileContext(
  input: DefaultVizInput,
  isNative: boolean,
): ProfileContext {
  return {
    isNative,
    native: input.native ?? null,
    aggregatedPrior: aggregatedPrior(input, isNative),
    rowCount: input.rows?.length ?? input.rowCountHint ?? null,
  };
}

function shapeContext(
  ctx: ProfileContext,
  aggregated: boolean,
  rowStats: RowStats | null,
): ShapeContext {
  return {
    isNative: ctx.isNative,
    aggregated,
    rowCount: rowStats?.rowCount ?? ctx.rowCount,
    rowCountExact: rowStats != null,
  };
}

type ProfiledStage = {
  profiles: ColumnProfile[];
  shape: Shape;
  rowStats: RowStats | null;
  profileMs: number;
  shapeMs: number;
};

function profileStage(
  input: DefaultVizInput,
  ctx: ProfileContext,
  rows: RowValues[] | undefined,
): ProfiledStage {
  const start = now();
  const inputs = buildProfileInputs(input);
  const initialProfiles = profileColumns(inputs, ctx);
  const preliminaryShape = summarizeShape(
    initialProfiles,
    shapeContext(ctx, ctx.aggregatedPrior, null),
  );
  if (rows == null) {
    const end = now();
    return {
      profiles: initialProfiles,
      shape: preliminaryShape,
      rowStats: null,
      profileMs: end - start,
      shapeMs: 0,
    };
  }
  const rowStats = computeRowStats(rows, initialProfiles, preliminaryShape);
  const refined = refineProfiles(initialProfiles, rowStats);
  const { profiles, aggregated } = promoteAggregatedIfGroupedKey(
    refined,
    rowStats,
    ctx.aggregatedPrior,
  );
  const profiledAt = now();
  const shape = summarizeShape(
    profiles,
    shapeContext(ctx, aggregated, rowStats),
  );
  return {
    profiles,
    shape,
    rowStats,
    profileMs: profiledAt - start,
    shapeMs: now() - profiledAt,
  };
}

function toAlternative(
  candidate: ScoredCandidate,
  shape: Shape,
  profiles: ColumnProfile[],
  rowStats: RowStats | null,
): Alternative {
  return {
    display: candidate.display,
    variant: candidate.variant,
    settings: settingsFor(candidate, shape, profiles, rowStats).settings,
    score: candidate.score,
    candidateId: candidate.id,
  };
}

function fallbackTable(): ScoredCandidate {
  return {
    id: "table:-:",
    display: "table",
    variant: null,
    mapping: {},
    feasible: true,
    hardFailures: [],
    penalties: [],
    score: 0,
  };
}

function decide(
  input: DefaultVizInput,
  rows: RowValues[] | undefined,
): Decision {
  const start = now();
  const isNative = isNativeInput(input);
  const ctx = profileContext(input, isNative);
  const stage: 1 | 2 = rows ? 2 : 1;

  const { profiles, shape, rowStats, profileMs, shapeMs } = profileStage(
    input,
    ctx,
    rows,
  );
  const profiledAt = now();

  const candidates = enumerateCandidates(shape, profiles);
  const enumeratedAt = now();

  const ranked = rankCandidates(candidates, shape, profiles, rowStats, stage);
  const chosen =
    ranked.find((candidate) => candidate.feasible) ?? fallbackTable();
  const scoredAt = now();

  const { settings, suggestedOrderBy } = settingsFor(
    chosen,
    shape,
    profiles,
    rowStats,
  );
  const alternatives = pickAlternatives(ranked, chosen).map((candidate) =>
    toAlternative(candidate, shape, profiles, rowStats),
  );
  const reasons = provisionalReasons(chosen, shape, profiles, rowStats);
  const confidence = computeConfidence(chosen, profiles, shape);
  const warnings = collectWarnings(confidence, shape, rowStats);
  const end = now();

  const timings: StageTimings = {
    profileMs,
    shapeMs,
    enumerateMs: enumeratedAt - profiledAt,
    scoreMs: scoredAt - enumeratedAt,
    settingsMs: end - scoredAt,
    totalMs: end - start,
  };

  return {
    display: chosen.display,
    variant: chosen.variant,
    settings,
    columnMapping: columnMappingNames(chosen, profiles),
    confidence,
    provisional: reasons.length > 0,
    provisionalReasons: reasons,
    alternatives,
    suggestedOrderBy,
    trace: {
      stage,
      profiles,
      shape,
      candidates: ranked,
      chosenId: chosen.id,
      rowStats,
      ruleFactor: ruleFactor(shape),
      reconcile: null,
      warnings,
      timings,
    },
  };
}

function collectWarnings(
  confidence: number,
  shape: Shape,
  rowStats: RowStats | null,
): string[] {
  const warnings: string[] = [];
  if (confidence < THRESH.CONFIDENCE_MIN) {
    warnings.push(`low confidence (${confidence.toFixed(2)})`);
  }
  const nullShares = Object.entries(rowStats?.nullCategoryMetricShare ?? {});
  for (const [index, share] of nullShares) {
    if (share > THRESH.NULL_CATEGORY_SHARE) {
      const name =
        shape.D.find((dim) => String(dim.index) === index)?.name ?? index;
      warnings.push(
        `${name}: ${Math.round(share * 100)}% of the metric has no category`,
      );
    }
  }
  if (rowStats?.flat.allYEqual) {
    warnings.push("every metric value is identical");
  }
  return warnings;
}

export function chooseDefaultViz(input: DefaultVizInput): Decision {
  return decide(input, input.rows);
}

export function chooseDefaultVizTwoStage(
  input: DefaultVizInput & { rows: RowValues[] },
): TwoStageDecision {
  const start = now();
  const stage1 = decide({ ...input, rows: undefined }, undefined);
  const stage1At = now();
  const stage2 = decide(input, input.rows);
  const stage2At = now();
  const final = reconcile(stage1, stage2);
  const end = now();

  const timings: TwoStageTimings = {
    stage1Ms: stage1At - start,
    rowStatsMs: stage2.trace.timings.profileMs,
    stage2Ms: stage2At - stage1At,
    reconcileMs: end - stage2At,
    totalMs: end - start,
    rowsScanned: stage2.trace.rowStats?.scanned ?? 0,
  };

  return { stage1, stage2, final, timings };
}
