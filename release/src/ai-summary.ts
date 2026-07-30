// AI-generated "major themes" summary for a release report.
//
// Rather than depend on an API key, we shell out to the `claude` CLI in headless
// print mode (`claude -p`). This means the report self-drives anywhere Claude
// Code is installed (a developer laptop, or CI with the CLI on PATH). If the CLI
// is unavailable or errors, we degrade gracefully to a deterministic summary so
// the report still renders.

import { spawn } from "child_process";

import type { ProjectSummary } from "./linear";

export type SummaryInput = {
  version: string;
  issueCount: number;
  linearIssueCount: number;
  projects: ProjectSummary[];
  /** The categorized release-notes markdown (used as grounding context). */
  notesMarkdown: string;
};

export type RunClaude = (prompt: string) => Promise<string>;

// Keep the grounding context bounded — release notes for a major can be long,
// and the theme summary only needs the shape of what shipped, not every line.
const MAX_NOTES_CHARS = 12_000;

export function buildSummaryPrompt(input: SummaryInput): string {
  const { version, issueCount, linearIssueCount, projects, notesMarkdown } = input;

  const namedProjects = projects.filter(p => p.project !== null);
  const projectLines = namedProjects
    .map(p => `- ${p.name} (${p.issueCount} issue${p.issueCount === 1 ? "" : "s"})`)
    .join("\n");

  const notes =
    notesMarkdown.length > MAX_NOTES_CHARS
      ? notesMarkdown.slice(0, MAX_NOTES_CHARS) + "\n\n…(truncated)…"
      : notesMarkdown;

  return [
    `You are writing the "major themes" section for the Metabase ${version} release notes.`,
    ``,
    `Below is the data for this release: ${issueCount} GitHub issues/PRs shipped, of which ${linearIssueCount} map to Linear issues across ${namedProjects.length} Linear projects.`,
    ``,
    `## Linear projects in this release (by issue count)`,
    projectLines || "(none)",
    ``,
    `## Categorized release notes`,
    notes,
    ``,
    `---`,
    `Write a concise, engaging summary of the MAJOR THEMES of this release in Markdown. Requirements:`,
    `- Start with a single italicized one-sentence TL;DR line.`,
    `- Then 3 to 6 themes. Each theme is a "### " heading (a short punchy title) followed by 1-3 sentences.`,
    `- Ground every claim in the data above. Do NOT invent features, numbers, or version details that are not present.`,
    `- Prefer themes that span multiple projects or many issues. It's fine to mention notable individual projects by name.`,
    `- Do not include a top-level "# " heading, and do not restate these instructions.`,
    `- Output ONLY the Markdown summary.`,
  ].join("\n");
}

// Default runner: pipe the prompt to `claude -p` on stdin and collect stdout.
const spawnClaude: RunClaude = (prompt: string) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn("claude", ["-p", "--output-format", "text"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("claude CLI timed out"));
    }, 180_000);

    child.stdout.on("data", d => (stdout += d.toString()));
    child.stderr.on("data", d => (stderr += d.toString()));
    child.on("error", err => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on("close", code => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`claude CLI exited with code ${code}: ${stderr.trim()}`));
      }
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });

function fallbackSummary(input: SummaryInput): string {
  const named = input.projects.filter(p => p.project !== null).slice(0, 6);
  const bullets = named
    .map(p => `- **${p.name}** — ${p.issueCount} issue${p.issueCount === 1 ? "" : "s"}`)
    .join("\n");

  return [
    `_AI summary unavailable (the \`claude\` CLI could not be reached); showing the top projects by issue count._`,
    ``,
    bullets || "_No Linear projects were detected in this release._",
  ].join("\n");
}

/**
 * Generate the "major themes" summary as Markdown. Never throws — on any failure
 * it returns a deterministic fallback so the report always renders.
 */
export async function generateThemeSummary(
  input: SummaryInput,
  runClaude: RunClaude = spawnClaude,
): Promise<string> {
  try {
    const summary = await runClaude(buildSummaryPrompt(input));
    const trimmed = summary.trim();
    return trimmed.length > 0 ? trimmed : fallbackSummary(input);
  } catch (error) {
    console.warn(`Theme summary generation failed: ${(error as Error).message}`);
    return fallbackSummary(input);
  }
}
