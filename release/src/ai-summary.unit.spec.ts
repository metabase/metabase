import { buildSummaryPrompt, generateThemeSummary, type SummaryInput } from "./ai-summary";
import type { ProjectSummary } from "./linear";

const projectSummary = (name: string | null, issueCount: number): ProjectSummary => ({
  project: name ? { id: name, name, url: `https://linear.app/${name}`, state: "started" } : null,
  name: name ?? "No Linear project",
  issueCount,
  issues: [],
});

const input: SummaryInput = {
  version: "v0.63.0",
  issueCount: 200,
  linearIssueCount: 150,
  projects: [
    projectSummary("Offer PDF attachments", 8),
    projectSummary("Accelerate Typescript migration", 3),
    projectSummary(null, 100),
  ],
  notesMarkdown: "## Bug fixes\n\n**Querying**\n\n- Fixed a thing (#1)",
};

describe("buildSummaryPrompt", () => {
  it("includes version, counts, named projects, and notes as grounding", () => {
    const prompt = buildSummaryPrompt(input);
    expect(prompt).toContain("Metabase v0.63.0");
    expect(prompt).toContain("200 GitHub issues/PRs");
    expect(prompt).toContain("150 map to Linear");
    expect(prompt).toContain("Offer PDF attachments (8 issues)");
    expect(prompt).toContain("Accelerate Typescript migration (3 issues)");
    // The "No Linear project" bucket is not a theme source.
    expect(prompt).not.toContain("No Linear project (100");
    expect(prompt).toContain("Fixed a thing (#1)");
  });

  it("truncates very long notes", () => {
    const long = { ...input, notesMarkdown: "x".repeat(20_000) };
    const prompt = buildSummaryPrompt(long);
    expect(prompt).toContain("…(truncated)…");
  });
});

describe("generateThemeSummary", () => {
  it("returns the CLI output when it succeeds", async () => {
    const runClaude = jest.fn(async () => "### Theme\nGreat stuff.");
    const summary = await generateThemeSummary(input, runClaude);
    expect(summary).toBe("### Theme\nGreat stuff.");
    expect(runClaude).toHaveBeenCalledTimes(1);
  });

  it("falls back to top projects when the CLI throws", async () => {
    const runClaude = jest.fn(async () => {
      throw new Error("claude not found");
    });
    const summary = await generateThemeSummary(input, runClaude);
    expect(summary).toContain("AI summary unavailable");
    expect(summary).toContain("**Offer PDF attachments** — 8 issues");
  });

  it("falls back when the CLI returns empty output", async () => {
    const runClaude = jest.fn(async () => "   ");
    const summary = await generateThemeSummary(input, runClaude);
    expect(summary).toContain("AI summary unavailable");
  });
});
