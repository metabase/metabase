import fs from "node:fs";
import path from "node:path";

const pagePath = path.resolve(
  "enterprise/backend/src/metabase_enterprise/osi_generation/demo/osi_generation.html",
);
const scriptPath = path.resolve(
  "enterprise/backend/src/metabase_enterprise/osi_generation/demo/osi_generation.js",
);

const statusResponse = {
  ai_features_enabled: true,
  available: true,
  configured: true,
  contexts: { approved: 0, generated: 0, total: 0 },
  enabled: true,
  index: { dependencies: {} },
  index_available: true,
  job: { info: {}, registered: true },
  model: "test-model",
  scheduler: {
    disabled: false,
    shutdown: false,
    standby: false,
    started: true,
  },
};

function response(body) {
  return {
    ok: true,
    text: async () => JSON.stringify(body),
  };
}

async function flushPromises() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}

describe("OSI generation page polling", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.documentElement.innerHTML = fs
      .readFileSync(pagePath, "utf8")
      .replace(/<script[^>]+><\/script>/, "");
    HTMLDialogElement.prototype.showModal = jest.fn();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("places retrieval comparison before the Library index", () => {
    const searchPanel = document.querySelector(".search-panel");
    const indexPanel = document.querySelector(".index-panel");

    expect(
      searchPanel.compareDocumentPosition(indexPanel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("uses one context action whose label follows the editor state", async () => {
    const entity = {
      context: {
        ai_context: {
          examples: [],
          instructions: "Use carefully",
          synonyms: [],
        },
        data_source: "generated",
      },
      description: "A useful metric",
      entity_local_id: 1,
      entity_type: "metric",
      generation_state: "generated",
      name: "Useful metric",
    };

    global.fetch = jest.fn(async (requestPath) => {
      if (requestPath.endsWith("/entities")) {
        return response({ data: [entity] });
      }
      if (requestPath.endsWith("/index")) {
        return response({ busy: false, data: [] });
      }
      if (requestPath.endsWith("/runs")) {
        return response({ data: [] });
      }
      if (requestPath.endsWith("/status")) {
        return response(statusResponse);
      }
      throw new Error(`Unexpected request: ${requestPath}`);
    });

    window.eval(fs.readFileSync(scriptPath, "utf8"));
    await flushPromises();
    document.querySelector(".entity-row").click();

    const save = document.querySelector("#save");
    expect(document.querySelector("#approve")).toBeNull();
    expect(save).toHaveTextContent("Approve unchanged");

    const context = document.querySelector("#context-json");
    context.value = context.value.replace(
      "Use carefully",
      "Use very carefully",
    );
    context.dispatchEvent(new Event("input"));

    expect(save).toHaveTextContent("Save + approve");
  });

  it("groups completed-run counts, usage, and index sync details", async () => {
    global.fetch = jest.fn(async (requestPath) => {
      if (requestPath.endsWith("/entities")) {
        return response({ data: [] });
      }
      if (requestPath.endsWith("/index")) {
        return response({ busy: false, data: [] });
      }
      if (requestPath.endsWith("/runs")) {
        return response({
          data: [
            {
              duration: 24807,
              ended_at: "2026-09-09T12:00:24Z",
              id: 17,
              outcome: "completed",
              started_at: "2026-09-09T12:00:00Z",
              status: "success",
              summary: {
                already_approved: 0,
                candidates: 3,
                errors: 0,
                generated: 3,
                llm_calls: [
                  {
                    duration_ms: 6572,
                    entity_local_id: 1,
                    entity_type: "table",
                    input_tokens: 1569,
                    outcome: "generated",
                    output_tokens: 256,
                  },
                  {
                    duration_ms: 9131,
                    entity_local_id: 2,
                    entity_type: "table",
                    input_tokens: 1565,
                    outcome: "generated",
                    output_tokens: 275,
                  },
                  {
                    duration_ms: 6173,
                    entity_local_id: 3,
                    entity_type: "table",
                    input_tokens: 1561,
                    outcome: "generated",
                    output_tokens: 260,
                  },
                ],
                pending: 0,
                reconcile: {
                  execution: { ran_ms: 2916, waited_ms: 0 },
                  index: { deleted: 0, inserted: 0, unchanged: 50 },
                },
                restamped: 0,
                skipped: 0,
                usage: { input_tokens: 4695, output_tokens: 791 },
              },
            },
          ],
        });
      }
      if (requestPath.endsWith("/status")) {
        return response(statusResponse);
      }
      throw new Error(`Unexpected request: ${requestPath}`);
    });

    window.eval(fs.readFileSync(scriptPath, "utf8"));
    await flushPromises();

    expect(document.querySelectorAll(".run-stat")).toHaveLength(7);
    expect(document.querySelector(".run-stat-grid")).toHaveTextContent(
      "3 Generated",
    );
    expect(document.querySelector(".run-detail-groups")).toHaveTextContent(
      "4,695 input tokens",
    );
    expect(document.querySelector(".run-detail-groups")).toHaveTextContent(
      "2.9 s runtime",
    );
    expect(document.querySelector(".run-description")).toBeNull();
    expect(document.querySelectorAll(".llm-call-row")).toHaveLength(3);
    expect(document.querySelector(".llm-calls")).toHaveTextContent(
      "3 sequential requests",
    );
    expect(document.querySelector(".llm-calls")).toHaveTextContent("9.1 s");
  });

  it("does not let an older refresh replace newer Library content", async () => {
    let resolveOldEntities;
    let entityRequests = 0;
    const entity = (name) => ({
      context: null,
      description: null,
      entity_local_id: 1,
      entity_type: "metric",
      generation_state: "missing",
      name,
    });

    global.fetch = jest.fn(async (requestPath) => {
      if (requestPath.endsWith("/entities")) {
        entityRequests += 1;
        if (entityRequests === 1) {
          return new Promise((resolve) => {
            resolveOldEntities = () =>
              resolve(response({ data: [entity("Old result")] }));
          });
        }
        return response({ data: [entity("New result")] });
      }
      if (requestPath.endsWith("/index")) {
        return response({ busy: false, data: [] });
      }
      if (requestPath.endsWith("/runs")) {
        return response({ data: [] });
      }
      if (requestPath.endsWith("/status")) {
        return response(statusResponse);
      }
      throw new Error(`Unexpected request: ${requestPath}`);
    });

    window.eval(fs.readFileSync(scriptPath, "utf8"));
    await flushPromises();
    document.querySelector("#refresh-all").dispatchEvent(new Event("click"));
    await flushPromises();

    expect(document.querySelector("#entity-list")).toHaveTextContent(
      "New result",
    );

    resolveOldEntities();
    await flushPromises();

    expect(document.querySelector("#entity-list")).toHaveTextContent(
      "New result",
    );
    expect(document.querySelector("#entity-list")).not.toHaveTextContent(
      "Old result",
    );
  });

  it("keeps visible index rows and retries when the index is briefly busy", async () => {
    let indexRequests = 0;
    const indexEntry = (text) => ({
      doc_id: `metric-1-${text}`,
      doc_text: text,
      doc_type: "name",
      entity_local_id: 1,
      entity_type: "metric",
      vector_base64: "AAE=",
      vector_dimensions: 2,
      vector_hash: "abcd",
    });

    global.fetch = jest.fn(async (requestPath, options = {}) => {
      if (requestPath.endsWith("/reconcile") && options.method === "POST") {
        return response({
          execution: { ran_ms: 10, waited_ms: 0 },
          index: { deleted: 1, inserted: 1, unchanged: 0 },
        });
      }
      if (requestPath.endsWith("/entities")) {
        return response({ data: [] });
      }
      if (requestPath.endsWith("/index")) {
        indexRequests += 1;
        if (indexRequests === 2) {
          return response({ busy: true, data: [] });
        }
        const text = indexRequests === 1 ? "Old index row" : "New index row";
        return response({ busy: false, data: [indexEntry(text)] });
      }
      if (requestPath.endsWith("/runs")) {
        return response({ data: [] });
      }
      if (requestPath.endsWith("/status")) {
        return response(statusResponse);
      }
      throw new Error(`Unexpected request: ${requestPath}`);
    });

    window.eval(fs.readFileSync(scriptPath, "utf8"));
    await flushPromises();
    document.querySelector("#reconcile").click();
    await flushPromises();

    expect(document.querySelector("#index-list")).toHaveTextContent(
      "Old index row",
    );
    expect(document.querySelector("#index-summary")).toHaveTextContent(
      "Updating…",
    );
    expect(
      document.querySelector("#reconcile").closest(".index-panel"),
    ).not.toBeNull();
    expect(document.querySelector(".workflow-actions")).not.toContainElement(
      document.querySelector("#reconcile"),
    );

    await jest.advanceTimersByTimeAsync(100);
    await flushPromises();

    expect(document.querySelector("#index-list")).toHaveTextContent(
      "New index row",
    );
    expect(document.querySelector("#index-list")).not.toHaveTextContent(
      "Old index row",
    );
  });

  it("keeps the scrollable content lists stable until an active run finishes", async () => {
    const calls = { entities: 0, index: 0, runs: 0, status: 0 };
    const runResponses = [
      [{ id: 17, status: "started", started_at: "2026-09-09T12:00:00Z" }],
      [
        {
          id: 17,
          status: "success",
          outcome: "completed",
          started_at: "2026-09-09T12:00:00Z",
          ended_at: "2026-09-09T12:00:02Z",
        },
      ],
    ];

    global.fetch = jest.fn(async (requestPath) => {
      if (requestPath.endsWith("/entities")) {
        calls.entities += 1;
        return response({ data: [] });
      }
      if (requestPath.endsWith("/index")) {
        calls.index += 1;
        return response({ busy: false, data: [] });
      }
      if (requestPath.endsWith("/runs")) {
        const data =
          runResponses[Math.min(calls.runs, runResponses.length - 1)];
        calls.runs += 1;
        return response({ data });
      }
      if (requestPath.endsWith("/status")) {
        calls.status += 1;
        return response(statusResponse);
      }
      throw new Error(`Unexpected request: ${requestPath}`);
    });

    window.eval(fs.readFileSync(scriptPath, "utf8"));
    await flushPromises();

    expect(calls).toEqual({ entities: 1, index: 1, runs: 1, status: 1 });

    await jest.advanceTimersByTimeAsync(1500);
    await flushPromises();

    expect(calls).toEqual({ entities: 2, index: 2, runs: 2, status: 2 });
  });

  it("keeps polling a completed run until its end timestamp is available", async () => {
    let runRequests = 0;
    const runs = [
      { id: 17, status: "started", started_at: "2026-09-09T12:00:00Z" },
      {
        id: 17,
        outcome: "completed",
        status: "success",
        started_at: "2026-09-09T12:00:00Z",
      },
      {
        ended_at: "2026-09-09T12:00:03Z",
        id: 17,
        outcome: "completed",
        status: "success",
        started_at: "2026-09-09T12:00:00Z",
      },
    ];

    global.fetch = jest.fn(async (requestPath) => {
      if (requestPath.endsWith("/entities")) {
        return response({ data: [] });
      }
      if (requestPath.endsWith("/index")) {
        return response({ busy: false, data: [] });
      }
      if (requestPath.endsWith("/runs")) {
        const data = [runs[Math.min(runRequests, runs.length - 1)]];
        runRequests += 1;
        return response({ data });
      }
      if (requestPath.endsWith("/status")) {
        return response(statusResponse);
      }
      throw new Error(`Unexpected request: ${requestPath}`);
    });

    window.eval(fs.readFileSync(scriptPath, "utf8"));
    await flushPromises();
    await jest.advanceTimersByTimeAsync(1500);
    await flushPromises();

    expect(document.querySelector(".run-timestamps")).toHaveTextContent("—");

    await jest.advanceTimersByTimeAsync(1500);
    await flushPromises();

    expect(runRequests).toBe(3);
    expect(document.querySelector(".run-timestamps")).not.toHaveTextContent(
      "—",
    );
  });

  it("does not repaint content lists on each active-run poll", async () => {
    const calls = { entities: 0, index: 0, runs: 0, status: 0 };

    global.fetch = jest.fn(async (requestPath) => {
      if (requestPath.endsWith("/entities")) {
        calls.entities += 1;
        return response({ data: [] });
      }
      if (requestPath.endsWith("/index")) {
        calls.index += 1;
        return response({ busy: false, data: [] });
      }
      if (requestPath.endsWith("/runs")) {
        calls.runs += 1;
        return response({
          data: [
            { id: 17, status: "started", started_at: "2026-09-09T12:00:00Z" },
          ],
        });
      }
      if (requestPath.endsWith("/status")) {
        calls.status += 1;
        return response(statusResponse);
      }
      throw new Error(`Unexpected request: ${requestPath}`);
    });

    window.eval(fs.readFileSync(scriptPath, "utf8"));
    await flushPromises();
    await jest.advanceTimersByTimeAsync(1500);
    await flushPromises();

    expect(calls).toEqual({ entities: 1, index: 1, runs: 2, status: 2 });
  });

  it("refreshes content when a queued run completes before its first poll", async () => {
    const calls = { entities: 0, index: 0, runs: 0, status: 0 };

    global.fetch = jest.fn(async (requestPath, options = {}) => {
      if (options.method === "POST") {
        return response(null);
      }
      if (requestPath.endsWith("/entities")) {
        calls.entities += 1;
        return response({ data: [] });
      }
      if (requestPath.endsWith("/index")) {
        calls.index += 1;
        return response({ busy: false, data: [] });
      }
      if (requestPath.endsWith("/runs")) {
        calls.runs += 1;
        const data =
          calls.runs === 1
            ? []
            : [
                {
                  id: 17,
                  status: "success",
                  outcome: "completed",
                  started_at: "2026-09-09T12:00:00Z",
                },
              ];
        return response({ data });
      }
      if (requestPath.endsWith("/status")) {
        calls.status += 1;
        return response(statusResponse);
      }
      throw new Error(`Unexpected request: ${requestPath}`);
    });

    window.eval(fs.readFileSync(scriptPath, "utf8"));
    await flushPromises();
    document.querySelector("#run-generation").click();
    await flushPromises();
    await jest.advanceTimersByTimeAsync(500);
    await flushPromises();

    expect(calls).toEqual({ entities: 2, index: 2, runs: 2, status: 2 });
  });
});
