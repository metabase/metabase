// Render a self-contained HTML release report. No external assets, fonts, or
// scripts — everything is inlined so the file can be opened straight from disk
// or shipped as a CI artifact.

import { escapeHtml, renderMarkdown } from "./markdown";
import type { ProjectSummary } from "./linear";
import type { ReleaseReportData } from "./release-report";

function stat(value: string | number, label: string): string {
  return `
    <div class="stat">
      <div class="stat-value">${escapeHtml(String(value))}</div>
      <div class="stat-label">${escapeHtml(label)}</div>
    </div>`;
}

function projectRow(summary: ProjectSummary, maxCount: number): string {
  const width = Math.max(3, Math.round((summary.issueCount / maxCount) * 100));
  const isNamed = summary.project !== null;

  const nameCell = isNamed
    ? `<a href="${escapeHtml(summary.project!.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
        summary.name,
      )}</a>`
    : `<span class="muted">${escapeHtml(summary.name)}</span>`;

  const state = summary.project?.state
    ? `<span class="pill">${escapeHtml(summary.project.state)}</span>`
    : "";

  const issueChips = summary.issues
    .map(
      issue =>
        `<a class="issue-chip" href="${escapeHtml(issue.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
          issue.identifier,
        )} — ${escapeHtml(issue.title)}</a>`,
    )
    .join("");

  return `
    <div class="project ${isNamed ? "" : "project--none"}">
      <div class="project-head">
        <div class="project-name">${nameCell} ${state}</div>
        <div class="project-count">${summary.issueCount}</div>
      </div>
      <div class="bar"><div class="bar-fill" style="width:${width}%"></div></div>
      <details>
        <summary>${summary.issueCount} Linear issue${summary.issueCount === 1 ? "" : "s"}</summary>
        <div class="issue-list">${issueChips}</div>
      </details>
    </div>`;
}

export function renderReleaseReportHtml({
  data,
  summaryMarkdown,
  generatedAt,
}: {
  data: ReleaseReportData;
  summaryMarkdown: string;
  generatedAt: string;
}): string {
  const namedProjects = data.projects.filter(p => p.project !== null);
  const maxCount = data.projects.reduce((m, p) => Math.max(m, p.issueCount), 1);

  const title = `Metabase ${data.majorVersion} — Release Report`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --bg: #f6f7f9;
    --card: #ffffff;
    --ink: #2e353b;
    --muted: #74838f;
    --line: #edf0f2;
    --brand: #509ee3;
    --brand-ink: #227fd2;
    --accent: #a989c5;
    --good: #84bb4c;
    --shadow: 0 1px 3px rgba(0,0,0,.06), 0 8px 24px rgba(15,42,68,.06);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 960px; margin: 0 auto; padding: 40px 24px 96px; }
  header.hero {
    background: linear-gradient(135deg, var(--brand) 0%, var(--brand-ink) 100%);
    color: #fff; border-radius: 16px; padding: 32px 32px 28px; box-shadow: var(--shadow);
  }
  header.hero .eyebrow { text-transform: uppercase; letter-spacing: .08em; font-size: 12px; font-weight: 700; opacity: .85; }
  header.hero h1 { margin: 6px 0 4px; font-size: 30px; letter-spacing: -.02em; }
  header.hero .sub { opacity: .9; font-size: 14px; }
  header.hero .sub code { background: rgba(255,255,255,.18); padding: 1px 6px; border-radius: 5px; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 22px; }
  .stat { background: rgba(255,255,255,.14); border-radius: 10px; padding: 14px 16px; }
  .stat-value { font-size: 24px; font-weight: 700; line-height: 1.1; }
  .stat-label { font-size: 12px; opacity: .9; margin-top: 2px; }
  section { margin-top: 34px; }
  .card { background: var(--card); border-radius: 14px; box-shadow: var(--shadow); padding: 24px 28px; }
  h2.section-title { font-size: 13px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); margin: 0 0 14px; }
  .summary :is(h1,h2,h3) { font-size: 17px; margin: 20px 0 6px; letter-spacing: -.01em; }
  .summary :is(h1,h2,h3):first-child { margin-top: 0; }
  .summary p { margin: 6px 0 12px; }
  .summary em { color: var(--muted); }
  .project { padding: 14px 0; border-top: 1px solid var(--line); }
  .project:first-child { border-top: 0; }
  .project-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .project-name { font-weight: 600; }
  .project-name a { color: var(--brand-ink); text-decoration: none; }
  .project-name a:hover { text-decoration: underline; }
  .project--none .project-name { font-weight: 500; }
  .project-count { font-variant-numeric: tabular-nums; font-weight: 700; color: var(--ink); }
  .pill { font-size: 11px; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 1px 8px; margin-left: 6px; text-transform: capitalize; }
  .bar { height: 6px; background: var(--line); border-radius: 999px; margin: 8px 0 6px; overflow: hidden; }
  .bar-fill { height: 100%; background: linear-gradient(90deg, var(--brand), var(--accent)); border-radius: 999px; }
  .project--none .bar-fill { background: #c7d0d8; }
  details { margin-top: 4px; }
  summary { cursor: pointer; color: var(--muted); font-size: 13px; }
  .issue-list { display: flex; flex-direction: column; gap: 4px; margin: 10px 0 4px; padding-left: 2px; }
  .issue-chip { font-size: 13px; color: var(--ink); text-decoration: none; padding: 3px 0; border-bottom: 1px dotted var(--line); }
  .issue-chip:hover { color: var(--brand-ink); }
  .muted { color: var(--muted); }
  .notes :is(h2) { font-size: 20px; margin: 26px 0 4px; padding-top: 18px; border-top: 2px solid var(--line); letter-spacing: -.01em; }
  .notes :is(h2):first-child { border-top: 0; padding-top: 0; margin-top: 0; }
  .notes p { margin: 14px 0 4px; font-weight: 700; color: var(--brand-ink); font-size: 13px; text-transform: uppercase; letter-spacing: .04em; }
  .notes ul { margin: 4px 0 10px; padding-left: 20px; }
  .notes li { margin: 3px 0; }
  .notes a { color: var(--muted); text-decoration: none; font-variant-numeric: tabular-nums; }
  .notes a:hover { color: var(--brand-ink); }
  footer { color: var(--muted); font-size: 12px; text-align: center; margin-top: 40px; }
  @media (max-width: 640px) {
    .stats { grid-template-columns: repeat(2, 1fr); }
    header.hero, .card { padding: 20px; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <div class="eyebrow">Release Report</div>
      <h1>Metabase ${escapeHtml(String(data.majorVersion))}</h1>
      <div class="sub">Everything on <code>${escapeHtml(data.branch)}</code> since <code>${escapeHtml(
        String(data.previousMajorVersion),
      )}</code> was cut from master</div>
      <div class="stats">
        ${stat(data.issues.length, "Issues shipped")}
        ${stat(data.prCount, "Pull requests")}
        ${stat(data.linearIssueCount, "Linear issues")}
        ${stat(namedProjects.length, "Linear projects")}
      </div>
    </header>

    <section>
      <div class="card">
        <h2 class="section-title">Major themes</h2>
        <div class="summary">${renderMarkdown(summaryMarkdown)}</div>
      </div>
    </section>

    <section>
      <div class="card">
        <h2 class="section-title">Projects in this release · ${namedProjects.length} projects</h2>
        ${data.projects.map(p => projectRow(p, maxCount)).join("\n")}
      </div>
    </section>

    <section>
      <div class="card">
        <h2 class="section-title">Release notes preview</h2>
        <div class="notes">${renderMarkdown(data.releaseNotesMarkdown)}</div>
      </div>
    </section>

    <footer>Generated ${escapeHtml(generatedAt)} · Metabase release automation</footer>
  </div>
</body>
</html>`;
}
