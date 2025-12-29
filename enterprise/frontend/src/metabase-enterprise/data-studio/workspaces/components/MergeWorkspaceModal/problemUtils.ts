import type { WorkspaceProblem } from "metabase-types/api";

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
    "external-dependencies": [],
    "internal-dependencies": [],
    "structural-issues": [],
    "unused-outputs": [],
  };

  for (const problem of problems) {
    if (problem.category === "external-downstream") {
      grouped["external-dependencies"].push(problem);
    } else if (problem.category === "internal-downstream") {
      grouped["internal-dependencies"].push(problem);
    } else if (
      problem.category === "internal" ||
      problem.category === "external"
    ) {
      grouped["structural-issues"].push(problem);
    } else if (problem.category === "unused") {
      grouped["unused-outputs"].push(problem);
    }
  }

  return grouped;
}

/**
 * Calculates the status for a group of problems
 * Unused problems are informational and don't affect status (always "passed")
 */
export function getCheckStatus(problems: WorkspaceProblem[]): CheckStatus {
  // Filter out unused problems for status calculation - they're informational only
  const relevantProblems = problems.filter((p) => p.category !== "unused");

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
    status: problems.length === 0 ? "passed" : "passed", // Unused is always passed (informational)
    count: problems.length,
    problems: problems, // Include all problems for display
  };
}

/**
 * Formats problem details for display
 */
export function formatProblemDetails(problem: WorkspaceProblem): string {
  const parts: string[] = [];

  // Add transform reference if available
  if ("transform" in problem.data && problem.data.transform) {
    const transform = problem.data.transform;
    const transformName =
      "name" in transform && transform.name
        ? transform.name
        : transform.id.toString();
    const transformType =
      transform.type === "workspace-transform" ? "workspace" : "external";
    parts.push(`${transformType} transform "${transformName}"`);
  }

  // Add table reference if available
  if ("output" in problem.data && problem.data.output) {
    const output = problem.data.output;
    if ("global" in output && output.global) {
      const schema = output.global.schema || "";
      const table = output.global.table || "";
      if (schema && table) {
        parts.push(`table "${schema}.${table}"`);
      } else if (table) {
        parts.push(`table "${table}"`);
      }
    }
  }

  // Add bad-refs for removed-field problems
  if ("bad-refs" in problem.data && problem.data["bad-refs"]) {
    const badRefs = problem.data["bad-refs"];
    if (Array.isArray(badRefs) && badRefs.length > 0) {
      const fieldNames = badRefs
        .map((ref) => (ref.data?.name ? ref.data.name : null))
        .filter(Boolean);
      if (fieldNames.length > 0) {
        parts.push(`removed fields: ${fieldNames.join(", ")}`);
      }
    }
  }

  // Add dependents if available
  if ("dependents" in problem.data && problem.data.dependents) {
    const dependents = problem.data.dependents;
    if (Array.isArray(dependents) && dependents.length > 0) {
      const dependentNames = dependents
        .map((dep: { name?: string; id?: string | number }) =>
          dep.name ? dep.name : dep.id?.toString(),
        )
        .filter(Boolean);
      if (dependentNames.length > 0) {
        parts.push(`affects: ${dependentNames.join(", ")}`);
      }
    }
  }

  // If we have the description and no specific details, use description
  if (parts.length === 0 && problem.description) {
    return problem.description;
  }

  return parts.length > 0
    ? `${problem.description}. ${parts.join(". ")}`
    : problem.description;
}

/**
 * Gets user-friendly check name for a category
 */
export function getCheckName(category: ProblemCheckCategory): string {
  return category
    .split("-")
    .map((word, index) =>
      index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word,
    )
    .join(" ");
}
