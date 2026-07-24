// Render a set of GitHub issues into the categorized release-notes Markdown used
// in the report page. This reuses the release-notes categorization (bug fix /
// enhancement / under-the-hood, grouped by product category) but emits a lean,
// preview-oriented Markdown body without the docker-image / download / upgrade
// boilerplate that the published changelog template carries.

import { categorizeIssues } from "./release-notes";
import type { Issue } from "./types";

const OTHER_CATEGORY = "Other";

// categorizeIssues keys its result by a private string enum; index it via the
// enum's underlying string values (kept in sync with release-notes.ts).
type GroupedIssues = Record<string, Record<string, Issue[]>>;

const SECTION_ORDER: { key: string; label: string }[] = [
  { key: "enhancements", label: "Enhancements" },
  { key: "bugFixes", label: "Bug fixes" },
  { key: "alreadyFixedIssues", label: "Already fixed" },
  { key: "underTheHoodIssues", label: "Under the hood" },
];

function sortCategories(categories: string[]): string[] {
  const named = categories.filter(c => c !== OTHER_CATEGORY).sort((a, b) => a.localeCompare(b));
  const other = categories.filter(c => c === OTHER_CATEGORY);
  return [...named, ...other];
}

function issueLine(issue: Issue): string {
  const url =
    issue.html_url ?? `https://github.com/metabase/metabase/issues/${issue.number}`;
  return `- ${issue.title.trim()} ([#${issue.number}](${url}))`;
}

export function renderReleaseNotesMarkdown(issues: Issue[]): string {
  const grouped = categorizeIssues(issues) as unknown as GroupedIssues;
  const out: string[] = [];

  for (const { key, label } of SECTION_ORDER) {
    const categoryMap = grouped[key] ?? {};
    const categories = sortCategories(Object.keys(categoryMap));

    const total = categories.reduce((n, c) => n + (categoryMap[c]?.length ?? 0), 0);
    if (total === 0) {
      continue;
    }

    out.push(`## ${label}`);

    for (const category of categories) {
      const categoryIssues = categoryMap[category] ?? [];
      if (categoryIssues.length === 0) {
        continue;
      }
      out.push(`**${category}**`);
      out.push(categoryIssues.map(issueLine).join("\n"));
    }
  }

  return out.join("\n\n");
}
