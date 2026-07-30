import {
  collectLinearProjects,
  getLinearIssuesForUrls,
  githubUrlsForReport,
  type LinearIssue,
} from "./linear";

const project = (id: string, name: string) => ({
  id,
  name,
  url: `https://linear.app/metabase/project/${id}`,
  state: "started",
});

const issue = (overrides: Partial<LinearIssue> & { identifier: string }): LinearIssue => ({
  title: `title ${overrides.identifier}`,
  url: `https://linear.app/metabase/issue/${overrides.identifier}`,
  team: { key: "GIT", name: "GitHub" },
  project: null,
  sourceUrl: "https://github.com/metabase/metabase/pull/1",
  ...overrides,
});

describe("collectLinearProjects", () => {
  it("groups issues by project and counts them", () => {
    const pdf = project("p1", "Offer PDF attachments");
    const summaries = collectLinearProjects([
      issue({ identifier: "EMB-1", project: pdf }),
      issue({ identifier: "EMB-2", project: pdf }),
      issue({ identifier: "QUE-1", project: project("p2", "Query improvements") }),
    ]);

    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toMatchObject({ name: "Offer PDF attachments", issueCount: 2 });
    expect(summaries[0].issues.map(i => i.identifier)).toEqual(["EMB-1", "EMB-2"]);
    expect(summaries[1]).toMatchObject({ name: "Query improvements", issueCount: 1 });
  });

  it("sorts named projects by count desc then name asc", () => {
    const summaries = collectLinearProjects([
      issue({ identifier: "A-1", project: project("a", "Alpha") }),
      issue({ identifier: "B-1", project: project("b", "Bravo") }),
      issue({ identifier: "B-2", project: project("b", "Bravo") }),
      issue({ identifier: "C-1", project: project("c", "Charlie") }),
    ]);

    // Bravo (2) first; Alpha & Charlie tie at 1 -> alphabetical
    expect(summaries.map(s => s.name)).toEqual(["Bravo", "Alpha", "Charlie"]);
  });

  it("always sorts the no-project bucket last, even when largest", () => {
    const summaries = collectLinearProjects([
      issue({ identifier: "N-1", project: null }),
      issue({ identifier: "N-2", project: null }),
      issue({ identifier: "N-3", project: null }),
      issue({ identifier: "P-1", project: project("p", "Small project") }),
    ]);

    expect(summaries.map(s => s.name)).toEqual(["Small project", "No Linear project"]);
    expect(summaries[1].issueCount).toBe(3);
    expect(summaries[1].project).toBeNull();
  });
});

describe("githubUrlsForReport", () => {
  it("builds pull + issue url variants and de-dupes", () => {
    const urls = githubUrlsForReport({
      owner: "metabase",
      repo: "metabase",
      prNumbers: [10, 10, 11],
      issueNumbers: [20],
    });

    expect(urls).toEqual([
      "https://github.com/metabase/metabase/pull/10",
      "https://github.com/metabase/metabase/pull/11",
      "https://github.com/metabase/metabase/issues/20",
    ]);
  });
});

describe("getLinearIssuesForUrls", () => {
  const okResponse = (data: unknown) => ({
    ok: true,
    status: 200,
    json: async () => ({ data }),
  });

  it("batches requests and de-dupes the same Linear issue across PR + issue URLs", async () => {
    const calls: string[] = [];
    const fetchFn = jest.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      calls.push(body.query);
      // batchSize 2 -> two batches of the 3 urls (pull/1, issues/2), (pull/3)
      // pull/1 and issues/2 both resolve to the SAME Linear issue EMB-7.
      return okResponse({
        u0: {
          nodes: [
            {
              issue: {
                identifier: "EMB-7",
                title: "PDF work",
                url: "https://linear.app/x/EMB-7",
                team: { key: "EMB", name: "Embedding" },
                project: { id: "p1", name: "PDF", url: "https://linear.app/p1", state: "started" },
              },
            },
          ],
        },
        u1: {
          nodes: [{ issue: { identifier: "EMB-7", title: "PDF work", url: "", team: null, project: null } }],
        },
      });
    });

    const issues = await getLinearIssuesForUrls({
      urls: [
        "https://github.com/metabase/metabase/pull/1",
        "https://github.com/metabase/metabase/issues/2",
        "https://github.com/metabase/metabase/pull/3",
      ],
      apiKey: "lin_test",
      batchSize: 2,
      fetchFn: fetchFn as any,
      sleep: async () => {},
    });

    // Two batches => two fetch calls.
    expect(fetchFn).toHaveBeenCalledTimes(2);
    // De-duped to a single EMB-7, keeping the first (richer) resolution.
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ identifier: "EMB-7", project: { name: "PDF" } });
    // Raw key sent to Linear was the actual GitHub URL.
    expect(calls[0]).toContain("metabase/metabase/pull/1");
  });

  it("retries on transient failure then succeeds", async () => {
    let attempt = 0;
    const fetchFn = jest.fn(async () => {
      attempt += 1;
      if (attempt === 1) {
        throw new Error("network blip");
      }
      return okResponse({ u0: { nodes: [] } });
    });

    const sleep = jest.fn(async () => {});

    const issues = await getLinearIssuesForUrls({
      urls: ["https://github.com/metabase/metabase/pull/1"],
      apiKey: "lin_test",
      fetchFn: fetchFn as any,
      sleep,
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(issues).toEqual([]);
  });
});
