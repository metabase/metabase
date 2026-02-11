import { match } from "ts-pattern";
import { t } from "ttag";

import type { WorkspaceProblem } from "metabase-types/api";
import {
  isKnownWorkspaceProblemData,
  isWorkspaceProblemDataExternalDownstreamNotRun,
  isWorkspaceProblemDataInternalDownstreamNotRun,
  isWorkspaceProblemDataRemovedField,
} from "metabase-types/guards";

export type ProblemCheckCategory =
  | "external-dependencies"
  | "internal-dependencies"
  | "structural-issues"
  | "unused-outputs";

export type GroupedProblems = {
  "external-dependencies": WorkspaceProblem[];
  "internal-dependencies": WorkspaceProblem[];
  "structural-issues": WorkspaceProblem[];
  "unused-outputs": WorkspaceProblem[];
};

export type CheckStatus = {
  status: "passed" | "failed";
  count: number;
  problems: WorkspaceProblem[];
};

/**
 * Groups problems by category into logical Quality Check categories
 */
export function groupProblemsByCategory(
  problems: WorkspaceProblem[],
): GroupedProblems {
  const grouped: GroupedProblems = {
    "external-dependencies": problems.filter(
      (problem) => problem.category === "external-downstream",
    ),
    "internal-dependencies": problems.filter(
      (problem) => problem.category === "internal-downstream",
    ),
    "structural-issues": problems.filter(
      (problem) =>
        problem.category === "internal" || problem.category === "external",
    ),
    "unused-outputs": problems.filter(
      (problem) => problem.category === "unused",
    ),
  };

  return grouped;
}

/**
 * Calculates the status for a group of problems
 * Unused problems are informational and don't affect status (always "passed")
 */
export function getCheckStatus(problems: WorkspaceProblem[]): CheckStatus {
  // Filter out unused problems for status calculation - they're informational only
  const relevantProblems = problems.filter(
    (problem) => problem.category !== "unused",
  );

  // If all problems are unused, return passed with empty array
  // If there are any non-unused problems, return failed with those problems
  return {
    status: relevantProblems.length === 0 ? "passed" : "failed",
    count: relevantProblems.length,
    problems: relevantProblems,
  };
}

/**
 * Calculates status including unused problems (for unused-outputs check)
 */
export function getCheckStatusWithUnused(
  problems: WorkspaceProblem[],
): CheckStatus {
  return {
    status: "passed", // Unused is always passed (informational)
    count: problems.length,
    problems: problems, // Include all problems for display
  };
}

/**
 * Formats problem details for display
 */
export function formatProblemDetails(problem: WorkspaceProblem): string {
  const parts: string[] = [];

  const transform = isKnownWorkspaceProblemData(problem)
    ? problem.transform
    : undefined;

  // Add transform reference if available
  if (transform) {
    const transformName = transform.name ?? transform.id.toString();
    const transformType =
      transform.type === "workspace-transform"
        ? t`workspace transform`
        : t`external transform`;

    parts.push(`${transformType} "${transformName}"`);
  }

  const output = isKnownWorkspaceProblemData(problem)
    ? problem.output
    : undefined;

  // Add table reference if available
  if (output) {
    const schema = output.schema || "";
    const table = output.table || "";

    if (schema && table) {
      parts.push(t`table "${schema}.${table}"`);
    } else if (table) {
      parts.push(t`table "${table}"`);
    }
  }

  const badRefs = isWorkspaceProblemDataRemovedField(problem)
    ? problem["bad-refs"]
    : undefined;

  // Add bad-refs for removed-field problems
  if (badRefs) {
    const fieldNames = badRefs
      .map((ref) => ref.name || ref.message || null)
      .filter(Boolean);

    if (fieldNames.length > 0) {
      parts.push(t`removed fields: ${fieldNames.join(", ")}`);
    }
  }

  const dependents =
    isWorkspaceProblemDataInternalDownstreamNotRun(problem) ||
    isWorkspaceProblemDataExternalDownstreamNotRun(problem)
      ? problem.dependents
      : undefined;

  // Add dependents if available
  if (dependents) {
    const dependentNames = dependents
      .map((dep: { name?: string; id?: string | number }) =>
        dep.name ? dep.name : dep.id?.toString(),
      )
      .filter(Boolean);

    if (dependentNames.length > 0) {
      parts.push(t`affects: ${dependentNames.join(", ")}`);
    }
  }

  // If we have the description and no specific details, use description
  if (parts.length === 0 && problem.description) {
    return problem.description;
  }

  return [problem.description, ...parts].join(". ");
}

export function getCheckTitle(category: ProblemCheckCategory): string {
  return match(category)
    .with("external-dependencies", () => t`External dependencies`)
    .with("internal-dependencies", () => t`Internal dependencies`)
    .with("structural-issues", () => t`Structural issues`)
    .with("unused-outputs", () => t`Unused outputs`)
    .exhaustive();
}
