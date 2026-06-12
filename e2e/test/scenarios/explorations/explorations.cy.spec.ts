import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";

const { H } = cy;
const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

type StructuredQuestionDetailsWithName = StructuredQuestionDetails & {
  name: string;
};

const ORDERS_COUNT_METRIC: StructuredQuestionDetailsWithName = {
  name: "Count of orders",
  type: "metric" as const,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar" as const,
};

const ORDERS_TIMESERIES_METRIC: StructuredQuestionDetailsWithName = {
  name: "Count of orders over time",
  type: "metric" as const,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "month" },
      ],
    ],
  },
  display: "line" as const,
};

function seedMetrics() {
  for (const metric of [ORDERS_COUNT_METRIC, ORDERS_TIMESERIES_METRIC]) {
    H.createQuestion(metric).then(({ body }) => {
      cy.request("GET", `/api/metric/${body.id}`);
    });
  }
}

/**
 * Create a timeline + one sentinel event in a single chain. The
 * Exploration timeline picker (`useGetExplorationTimelinesQuery`) hides
 * timelines without events, so test fixtures that want to surface the
 * timeline in the picker — or attach it to an exploration — need at
 * least one event hanging off it.
 *
 * Returns the new `timeline_id` so callers that need it (e.g. to assert
 * a request body's `timeline_ids` field) can chain off it; call sites
 * that just need the timeline to exist can ignore the return value.
 */
function createTimelineWithSentinelEvent(
  name: string,
  icon: string,
): Cypress.Chainable<number> {
  return cy
    .request("POST", "/api/timeline", {
      name,
      collection_id: null,
      icon,
      default: false,
    })
    .then(({ body }: { body: { id: number } }) => {
      const timelineId = body.id;
      return cy
        .request("POST", "/api/timeline-event", {
          timeline_id: timelineId,
          name: `${name} event`,
          icon,
          timestamp: "2026-01-01T00:00:00Z",
          time_matters: false,
          timezone: "UTC",
        })
        .then(() => timelineId);
    });
}

describe("scenarios > explorations > new research > manual flow", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.enableExplorations();
    seedMetrics();
    H.resetSnowplow();
    H.enableTracking();
    // Match by pathname so the alias fires for both the initial
    // mount request AND debounced search refetches like
    // `/api/exploration/dimensions?q=over%20time` (the string-form
    // intercept matches against the full URL incl. query string).
    cy.intercept({
      method: "GET",
      pathname: "/api/exploration/dimensions",
    }).as("getDimensions");
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
    cy.task("stopMockLlmServer");
  });

  it("renders the empty research-mode landing with a disabled CTA", () => {
    H.visitNewExploration();

    cy.findByRole("main")
      .findByText(/What do you want to research\?/i)
      .should("be.visible");

    H.explorationsMetabotPromptInput().should("be.visible");

    H.startManualExploration();
    cy.findByTestId("research-content")
      .findByRole("button", { name: /Data/ })
      .should("be.visible");
    cy.findByTestId("research-content")
      .findByRole("button", { name: /Events/ })
      .should("be.visible");

    // CTA only appears once at least one block is added.
    cy.findByRole("button", { name: /Start research/i }).should("not.exist");
  });

  it("picks metrics + dimensions, creates an exploration, and lands on the detail page", () => {
    H.visitNewExploration();
    H.startManualExploration();

    H.addMetricsAndDimensions({
      metrics: ["Count of orders"],
    });

    cy.findByTestId("research-content")
      .findByText("Count of orders")
      .should("be.visible");

    H.beginResearch().then((id) => {
      H.expectUnstructuredSnowplowEvent({
        event: "exploration_plan_edited",
        triggered_from: "manual",
        event_detail: "metrics",
      });
      H.expectUnstructuredSnowplowEvent({
        event: "exploration_created",
        target_id: id,
      });

      // Detail page (`/question/research/:id`) renders. The BE
      // defaults `name` to "New exploration" when the user hasn't
      // set one — see `buildCreateExplorationRequest` in
      // `NewExplorationData.tsx`.
      cy.url().should("include", `/question/research/${id}`);
      // No new-exploration CTA on the detail page.
      cy.findByRole("button", { name: /Start research/i }).should("not.exist");
    });
  });

  it("filters Exploration data pickers by typing into their search inputs", () => {
    // Both timelines need an event so the picker surfaces them — the
    // empty-state case is still exercised by the "no match" search at
    // the bottom of this test.
    createTimelineWithSentinelEvent("Releases", "star");
    createTimelineWithSentinelEvent("Marketing campaigns", "bell");

    H.visitNewExploration();
    H.startManualExploration();

    // --- "+ Data" → Metrics modal search ---
    cy.findByRole("button", { name: /Data/ }).click();
    cy.findByRole("menuitem", { name: "Metrics" }).click();
    // Seeded names are "Count of orders" + "Count of orders over time".
    cy.wait("@getDimensions");
    // Seeded metrics aren't in the library; switch off the default Library tab.
    H.selectAllMetricsTab();
    cy.findByRole("checkbox", { name: "Count of orders" }).should("exist");
    cy.findByRole("checkbox", { name: "Count of orders over time" }).should(
      "exist",
    );

    // Type a substring that only matches the timeseries metric.
    cy.findByPlaceholderText("Search for a metric").type("over time");
    cy.wait("@getDimensions");
    cy.findByRole("checkbox", { name: "Count of orders over time" }).should(
      "exist",
    );
    cy.findByRole("checkbox", { name: "Count of orders" }).should("not.exist");

    // Clear the input → both rows return.
    cy.findByPlaceholderText("Search for a metric").clear();
    cy.findByRole("checkbox", { name: "Count of orders" }).should("exist");
    cy.findByRole("checkbox", { name: "Count of orders over time" }).should(
      "exist",
    );

    // Search for something that matches no metric → empty-state copy.
    cy.findByPlaceholderText("Search for a metric").type("zzz no such metric");
    cy.wait("@getDimensions");
    cy.findByRole("dialog").findByText("No results").should("be.visible");

    // Close the metrics modal before opening the events one.
    cy.get("body").type("{esc}");

    // --- "+ Events" modal search ---
    cy.findByRole("button", { name: /Events/ }).click();
    cy.findByRole("checkbox", { name: "Releases" }).should("exist");
    cy.findByRole("checkbox", { name: "Marketing campaigns" }).should("exist");

    // Filter to just one timeline by name fragment.
    cy.findByPlaceholderText("Search for a timeline").type("release");
    cy.findByRole("checkbox", { name: "Releases" }).should("exist");
    cy.findByRole("checkbox", { name: "Marketing campaigns" }).should(
      "not.exist",
    );

    // Clear → both return.
    cy.findByPlaceholderText("Search for a timeline").clear();
    cy.findByRole("checkbox", { name: "Releases" }).should("exist");
    cy.findByRole("checkbox", { name: "Marketing campaigns" }).should("exist");

    // No match → empty-state copy.
    cy.findByPlaceholderText("Search for a timeline").type("zzz");
    cy.findByRole("dialog").findByText("No results").should("be.visible");
  });

  it("picks one or more timelines via the Browse tab and POSTs them with the exploration", () => {
    createTimelineWithSentinelEvent("Releases", "star").then((releasesId) => {
      createTimelineWithSentinelEvent("Marketing campaigns", "bell").then(
        (marketingId) => {
          H.visitNewExploration();
          H.startManualExploration();
          H.addMetricsAndDimensions({ metrics: ["Count of orders"] });

          // Pick two timelines via the "+ Events" modal.
          H.addTimelinesToExploration(["Marketing campaigns", "Releases"]);

          // The first picked timeline shows as a pill next to the Events
          // button; the rest collapse into a "+N" overflow pill.
          cy.findByTestId("research-content")
            .findByText("Marketing campaigns")
            .should("be.visible");
          cy.findByTestId("research-content")
            .findByText("+1")
            .should("be.visible");

          // Verify the request body forwards both timeline ids
          cy.intercept("POST", "/api/exploration").as("createExploration");
          cy.findByRole("button", { name: /Start research/i }).click();
          cy.wait("@createExploration").then(({ request, response }) => {
            expect(request.body.timeline_ids).to.deep.eq([
              marketingId,
              releasesId,
            ]);
            const id = response?.body?.id as number;
            H.expectUnstructuredSnowplowEvent({
              event: "exploration_plan_edited",
              triggered_from: "manual",
              event_detail: "metrics",
            });
            H.expectUnstructuredSnowplowEvent({
              event: "exploration_plan_edited",
              triggered_from: "manual",
              event_detail: "timelines",
            });
            H.expectUnstructuredSnowplowEvent({
              event: "exploration_created",
              target_id: id,
            });
            cy.url().should("include", `/question/research/${id}`);
          });
        },
      );
    });
  });
});

describe("scenarios > explorations > new research > metabot flow", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.enableExplorations();
    seedMetrics();
    H.resetSnowplow();
    H.enableTracking();
    cy.intercept({
      method: "GET",
      pathname: "/api/exploration/dimensions",
    }).as("getDimensions");
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
    cy.task("stopMockLlmServer");
  });

  it("auto-populates metrics + dimensions + name from agent tool calls, then Start research succeeds", () => {
    cy.request("GET", "/api/exploration/dimensions").then(({ body }) => {
      const data = body as {
        metrics: Array<{ id: number; name: string; dimension_ids: string[] }>;
        dimension_groups: Array<{
          name: string;
          dimension_interestingness: number | null;
          dimensions: Array<{
            id: string;
            name: string;
            display_name: string;
            dimension_interestingness: number | null;
          }>;
        }>;
      };

      const firstMetric = data.metrics[0];
      const interestingGroup =
        data.dimension_groups.find((g) =>
          g.dimensions.some((d) => (d.dimension_interestingness ?? 0) >= 0.7),
        ) ?? data.dimension_groups[0];
      expect(
        firstMetric,
        "seeded metric is exposed by /api/exploration/dimensions",
      ).to.exist;
      expect(interestingGroup, "at least one dimension group is exposed").to
        .exist;

      const agentName = "New exploration";
      H.mockExplorationsAgentToolCalls([
        {
          toolCallId: "metrics-1",
          toolName: "select_research_metrics",
          result: {
            metrics: [firstMetric],
            dimension_groups: [interestingGroup],
          },
        },
        {
          toolCallId: "name-1",
          toolName: "set_research_name",
          result: { name: agentName },
        },
      ]);

      H.visitNewExploration();

      H.explorationsMetabotPromptInput().type("Why are signups down?");
      cy.findByRole("button", { name: /Create plan/i }).click();

      // The chat dispatch went through with the `explorations`
      // profile, confirming we wired the new-exploration page to
      // the right agent.
      cy.wait("@metabotAgent")
        .its("request.body.profile_id")
        .should("eq", "explorations");

      // Right panel hydrated from the tool-call result — the agent's
      // metric now heads a research-plan block.
      cy.findByRole("main").findByText(firstMetric.name).should("be.visible");

      // Click Start research; the create-exploration POST body
      // should carry the name the agent picked.
      cy.intercept("POST", "/api/exploration").as("createExploration");
      cy.findByRole("button", { name: /Start research/i }).click();
      cy.wait("@createExploration").then(({ request, response }) => {
        expect(request.body.name).to.eq(agentName);
        const id = response?.body?.id as number;
        H.expectUnstructuredSnowplowEvent({
          event: "exploration_agent_message_sent",
        });
        H.expectUnstructuredSnowplowEvent({
          event: "exploration_plan_edited",
          triggered_from: "agent",
          event_detail: "metrics",
        });
        H.expectUnstructuredSnowplowEvent({
          event: "exploration_created",
          target_id: id,
        });
      });
    });
  });
});

describe("scenarios > explorations > detail page", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.enableExplorations();
    seedMetrics();
    H.resetSnowplow();
    H.enableTracking();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
    cy.task("stopMockLlmServer");
  });

  it("auto-selects a sidebar entity on first load and toggles via ArrowRight/ArrowLeft", () => {
    H.createExplorationViaApi({ name: "Keyboard nav fixture" }).then((id) => {
      H.visitExploration(id);

      // After landing, the page auto-selects the most-interesting
      // entity (see `ExplorationPage` selection logic). The
      // `ExplorationTreeItem` is a `<a role="treeitem">` that
      // toggles `aria-selected`. We identify the selected row via a
      // CSS attribute selector rather than testing-library's
      // `{ selected: true }` filter so each read goes through a
      // fresh, reactive Cypress query.
      //
      // The `ExplorationTreeItem` link has no `id` attribute, so we
      // identify the row by its trimmed text content (group/query
      // name). Each selected-state read goes through a fresh
      // selector so the detached-subject error can't bite after a
      // keyboard-driven re-render.
      const selectedRows = () =>
        cy
          .findAllByRole("treeitem", { timeout: 15000 })
          .filter('[aria-selected="true"]');

      selectedRows().should("have.length.at.least", 1);

      const readSelectedText = () =>
        selectedRows()
          .first()
          .invoke("text")
          .then((s: string) => s.trim());

      readSelectedText().then((initialText) => {
        cy.wrap(initialText).as("initialText");

        // The keyboard handler attaches to `window` (see
        // `ExplorationSidebar.tsx`), so we fire the event on the
        // body.
        cy.get("body").type("{rightarrow}");
        readSelectedText().should("not.eq", initialText);

        cy.get("body").type("{leftarrow}");
        readSelectedText().should("eq", initialText);

        H.expectUnstructuredSnowplowEvent({
          event: "exploration_visualization_changed",
          triggered_from: "keyboard",
        });
      });
    });
  });

  it("groups sidebar rows as `<metric> → By <dimension>`, makes the headings collapsible, and marks interesting groups", () => {
    cy.request("GET", "/api/exploration/dimensions").then(({ body }) => {
      const data = body as {
        metrics: Array<{ id: number; name: string; dimension_ids: string[] }>;
        dimension_groups: Array<{
          dimensions: Array<{ id: string; display_name: string }>;
        }>;
      };
      const ordersMetric = data.metrics.find(
        (m) => m.name === "Count of orders",
      );
      expect(
        ordersMetric,
        '"Count of orders" metric is exposed by /api/exploration/dimensions',
      ).to.exist;
      const dimsById = new Map(
        data.dimension_groups.flatMap((g) =>
          g.dimensions.map((d) => [d.id, d] as const),
        ),
      );
      const pickedDimensions = ordersMetric!.dimension_ids
        .map((id) => dimsById.get(id))
        .filter((d): d is { id: string; display_name: string } => d != null)
        .slice(0, 2);
      expect(
        pickedDimensions.length,
        "metric exposes at least two dimensions",
      ).to.eq(2);

      H.createExplorationViaApi({
        name: "Sidebar grouping fixture",
        metricCardIds: [ordersMetric!.id],
        dimensionIds: pickedDimensions.map((d) => d.id),
      }).then((id) => {
        H.visitExploration(id);

        // Wait for the BE to finish executing queries — the
        // tree only renders headings that have non-empty children.
        cy.findAllByLabelText("Ready", { timeout: 30000 })
          .first()
          .should("be.visible");

        cy.findByTestId("exploration-page-sidebar").within(() => {
          const metricHeading = () =>
            cy.findByRole("group", { name: ordersMetric!.name });

          metricHeading().should("be.visible");
          for (const dim of pickedDimensions) {
            cy.findByText(`by ${dim.display_name}`).should("be.visible");
          }

          // Collapse the metric heading: aria-expanded flips and
          // both leaves disappear.
          metricHeading()
            .should("have.attr", "aria-expanded", "true")
            .click()
            .should("have.attr", "aria-expanded", "false");
          for (const dim of pickedDimensions) {
            cy.findByText(`by ${dim.display_name}`).should("not.exist");
          }

          // Re-expand: both leaves return.
          metricHeading().click().should("have.attr", "aria-expanded", "true");
          for (const dim of pickedDimensions) {
            cy.findByText(`by ${dim.display_name}`).should("be.visible");
          }
        });

        cy.request("GET", `/api/exploration/${id}`).then(({ body }) => {
          const QUERY_INTERESTINGNESS_SCORE_THRESHOLD = 0.7;
          type Group = {
            parent_group_id: number | null;
            interestingness_score: number | null;
          };
          const interestingLeafGroups = (
            (body.threads ?? []).flatMap(
              (t: { groups?: Group[] }) => t.groups ?? [],
            ) as Group[]
          ).filter(
            (g) =>
              g.parent_group_id != null &&
              (g.interestingness_score ?? 0) >
                QUERY_INTERESTINGNESS_SCORE_THRESHOLD,
          );
          if (interestingLeafGroups.length > 0) {
            cy.findAllByTestId("potentially-interesting-marker").should(
              "have.length",
              interestingLeafGroups.length,
            );
          } else {
            cy.findAllByTestId("potentially-interesting-marker").should(
              "not.exist",
            );
          }
        });
      });
    });
  });

  it("changes sidebar selection on click and shows the corresponding visualization area", () => {
    H.createExplorationViaApi({ name: "Click selection fixture" }).then(
      (id) => {
        H.visitExploration(id);

        // Click the FIRST sidebar row explicitly. After click,
        // that row owns `aria-selected=true`.
        cy.findAllByRole("treeitem").first().click();
        cy.findAllByRole("treeitem")
          .first()
          .should("have.attr", "aria-selected", "true");

        // Main area renders something — scope to `main` to avoid
        // matching the sidebar copy.
        cy.findByRole("main").should("not.be.empty");
      },
    );
  });

  it("preserves the URL `timeline` param across navigation and reload", () => {
    cy.request("POST", "/api/timeline", {
      name: "Releases",
      collection_id: null,
      icon: "star",
      default: false,
    }).then(({ body: timeline }) => {
      const timelineId = timeline.id as number;
      H.createExplorationViaApi({
        name: "Timeline persistence fixture",
        timelineIds: [timelineId],
      }).then((id) => {
        cy.visit(`/question/research/${id}?timeline=${timelineId}`);
        // Sidebar treeitems appear once the BE returns query rows.
        cy.findAllByRole("treeitem", { timeout: 15000 })
          .first()
          .should("be.visible");
        cy.location("search").should("include", `timeline=${timelineId}`);

        // Reload — the URL param is the source of truth and the
        // router shouldn't rewrite it away on hydration.
        cy.reload();
        cy.findAllByRole("treeitem", { timeout: 15000 })
          .first()
          .should("be.visible");
        cy.location("search").should("include", `timeline=${timelineId}`);
      });
    });
  });

  it("auto-creates Scratchpad + AI Summary documents under the Findings sidebar heading, with a Move to trash action in each doc's three-dots menu", () => {
    H.createExplorationViaApi({ name: "Documents fixture" }).then((id) => {
      H.visitExploration(id);

      // Expand the `Findings` heading so its child rows render
      const findingsHeading = () =>
        cy.findByRole("group", { name: "Findings" });
      findingsHeading()
        .should("have.attr", "aria-expanded")
        .then((expanded) => {
          if (expanded !== "true") {
            findingsHeading().click();
          }
        });

      cy.findByText("AI Summary").should("be.visible");
      cy.findAllByText("Scratchpad").should("be.visible");

      // Click each document, open the three-dots `More options`
      // menu in its detail view, and assert `Move to trash` is
      // available. The doc detail page lives at
      // `/question/research/:id/document/:documentId`.
      cy.request("GET", `/api/exploration/${id}`).then(({ body }) => {
        const docs = (body.threads ?? []).flatMap(
          (t: { documents?: Array<{ id: number; name: string }> }) =>
            t.documents ?? [],
        ) as Array<{ id: number; name: string }>;
        const scratchpadDoc = docs.find((d) => d.name === "Scratchpad");
        const autoDoc = docs.find((d) => d.name === "AI Summary");
        expect(scratchpadDoc, "BE created a Scratchpad document").to.exist;
        expect(autoDoc, "BE created an AI Summary document").to.exist;

        for (const doc of [scratchpadDoc!, autoDoc!]) {
          cy.visit(`/question/research/${id}/document/${doc.id}`);
          cy.findByRole("button", { name: "Save" }).should("not.exist");
          cy.findByLabelText("More options").click();
          // `metabase/documents/components/DocumentMenu.tsx` puts
          // the trash action behind a `canWrite && onArchive` gate;
          // an admin user always satisfies that.
          cy.findByRole("menuitem", { name: /Move to trash/i }).should(
            "be.visible",
          );
          // Dismiss the menu before moving on so the next iteration
          // doesn't collide with a still-open menu.
          cy.findByLabelText("More options").click();
        }
      });
    });
  });

  it("adds a chart to the Scratchpad document via the Add to document button and lands on the document", () => {
    createTimelineWithSentinelEvent("Releases", "star").then((timelineId) => {
      H.createExplorationViaApi({
        name: "Chart add fixture",
        timelineIds: [timelineId],
      }).then((id) => {
        H.visitExploration(id);

        cy.findByRole("treeitem", { name: /By Created At/i }).click();

        cy.log("timeline should be visible in the viz");
        cy.findAllByTestId("visualization-root")
          .first()
          .within(() => {
            H.echartsIcon("star").should("be.visible");
          });

        cy.intercept("POST", "/api/exploration/thread/*/documents/*/append").as(
          "appendChart",
        );
        cy.findByLabelText("Add to document").click();

        // The detail page shows one entry per visible SeriesGroup —
        // even on this no-segment fixture the BE planner usually
        // emits more than one group per leaf (default + temporal /
        // top-N variants), so the doc menu enters the chart-picker
        // stage first. Pick the first listed chart, then `Scratchpad`.
        cy.findByText("Pick a chart").should("be.visible");
        cy.findAllByRole("menuitem").first().click();

        cy.findByText("Add to").should("be.visible");
        // Mantine renders the leftSection icon's `aria-label` ("document
        // icon") into the menuitem's accessible name (it becomes
        // "document icon Scratchpad"), so we match by regex on the doc name.
        cy.findByRole("menuitem", { name: /Scratchpad/ }).click();
        cy.wait("@appendChart").then(({ request, response }) => {
          expect(response?.statusCode).to.eq(200);
          // The append endpoint always takes the array form. The
          // picked SeriesGroup's `queryIds` is the full set of
          // source queries (the BE then materialises one composite
          // ephemeral card via `composite/combine`). Length is 1 for
          // a single-query group, N for a multi-series cartesian or
          // heat-map — we only guard that the FE sends the array
          // shape and not the legacy singular `exploration_query_id`.
          const ids = request.body.exploration_query_ids as number[];
          expect(ids).to.be.an("array");
          expect(ids.length).to.be.at.least(1);
        });

        // Toast renders with a link whose text is the doc name.
        cy.findByText("Added to").should("be.visible");
        cy.findByRole("link", { name: "Scratchpad" }).click();

        // Detail page renders with exactly one composite-ephemeral
        // card embed (not N per-query embeds).
        cy.url().should("include", `/question/research/${id}/document/`);
        cy.findAllByTestId("document-card-embed").should("have.length", 1);
        cy.findByRole("button", { name: "Save" }).should("not.exist");

        cy.log("timeline should be visible in the document");
        H.echartsIcon("star").should("be.visible");
      });
    });
  });

  it("flips the AI Summary doc from running → done when the BE marks the thread complete, surfaces a toast, and renders the finished body when opened", () => {
    H.createExplorationViaApi({ name: "AI completion fixture" }).then((id) => {
      const FINISHED_TEXT = "AI analysis complete: orders are trending upward";

      // Mutable flag the intercepts close over.
      const state = { completed: false };
      const completedDoc = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: FINISHED_TEXT }],
          },
        ],
      };

      const placeholderDoc = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "AI Summary is generating an analysis…",
                marks: [{ type: "italic" }],
              },
            ],
          },
        ],
      };

      // Force the AI Summary doc into the "running" state
      // (`completed_at: null` + placeholder body) until we flip
      // the flag, regardless of what the BE has actually written.
      // Without LLM configured, the BE's task runner sets
      // `completed_at` almost immediately after the queries
      // finish, which would short-circuit the UI's null →
      // non-null transition we're trying to observe.
      cy.intercept("GET", `/api/exploration/${id}`, (req) => {
        req.continue((res) => {
          const body = res.body as {
            threads?: Array<{
              ai_summary_document_id: number | null;
              completed_at: string | null;
              documents?: Array<{ id: number; document?: unknown }>;
            }>;
          };
          body.threads = (body.threads ?? []).map((thread) => ({
            ...thread,
            completed_at: state.completed
              ? (thread.completed_at ?? new Date().toISOString())
              : null,
            documents: (thread.documents ?? []).map((doc) =>
              doc.id === thread.ai_summary_document_id
                ? {
                    ...doc,
                    document: state.completed ? completedDoc : placeholderDoc,
                  }
                : doc,
            ),
          }));
        });
      }).as("getExploration");

      H.visitExploration(id);

      // Expand the `Findings` sidebar heading so the AI Summary
      // doc row is in the DOM. (It starts collapsed; the heading
      // is named after the user-doc, which shares the literal
      // string — only the `role="group"` heading has aria-expanded.)
      cy.findByRole("group", { name: "Findings" })
        .should("have.attr", "aria-expanded")
        .then((expanded) => {
          if (expanded !== "true") {
            cy.findByRole("group", { name: "Findings" }).click();
          }
        });

      // Pre-completion: the AI Summary doc row reads as busy
      // (loading renders as shimmering text + `aria-busy`, not
      // a swapped-in spinner).
      cy.findByText("AI Summary")
        .closest('[role="treeitem"]')
        .should("have.attr", "aria-busy", "true");

      // Look up the AI Summary doc id so we can target the
      // doc-fetch intercept precisely.
      cy.request("GET", `/api/exploration/${id}`).then(({ body }) => {
        const autoDocId = (body.threads ?? [])
          .map(
            (t: { ai_summary_document_id: number | null }) =>
              t.ai_summary_document_id,
          )
          .find((d: number | null) => d != null);
        expect(autoDocId, "BE set ai_summary_document_id").to.be.a("number");

        cy.intercept("GET", `/api/document/${autoDocId}`, (req) => {
          req.continue((res) => {
            if (!state.completed) {
              return;
            }
            const body = res.body as { document?: unknown };
            body.document = completedDoc;
          });
        }).as("getAutoDocument");

        // Flip the completion flag. The 2-second poll will pick
        // up the new shape; the FE's `useEffect` watching
        // `completed_at` then fires the toast and invalidates
        // the doc cache.
        cy.then(() => {
          state.completed = true;
        });

        // Toast appears with the success message + a `View`
        // action button (the user is not currently viewing the
        // AI Summary doc, so the action renders).
        cy.findByText("AI Summary ready", { timeout: 10000 }).should(
          "be.visible",
        );

        // Sidebar row settles: the AI Summary doc row drops
        // `aria-busy` and exposes the `Ready` icon label.
        cy.findByText("AI Summary")
          .closest('[role="treeitem"]')
          .should("have.attr", "aria-busy", "false");
        cy.findByText("AI Summary")
          .closest('[role="treeitem"]')
          .findByLabelText("Ready")
          .should("be.visible");

        // Click the toast's `View` action → navigates to the
        // AI Summary doc page.
        cy.findByRole("button", { name: "View" }).click();

        cy.url().should(
          "include",
          `/question/research/${id}/document/${autoDocId}`,
        );

        // Doc detail renders the finished body. The intercept
        // for `/api/document/:id` rewrote the body before the
        // editor mounted, so the new text appears in place of
        // the BE placeholder copy.
        cy.findByText(FINISHED_TEXT).should("be.visible");

        H.expectUnstructuredSnowplowEvent({
          event: "exploration_ai_summary_opened",
          target_id: id,
        });
      });
    });
  });

  it("on a stacked-chart page (group with multiple queries) the Add to document flow first prompts to pick a chart, then a document", () => {
    H.createSegment({
      name: "Recent orders",
      description: "Orders from the last year",
      table_id: ORDERS_ID,
      definition: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        filter: [
          "time-interval",
          ["field", ORDERS.CREATED_AT, null],
          -365,
          "day",
        ],
      },
    });

    H.createExplorationViaApi({ name: "Stacked-chart add fixture" }).then(
      (id) => {
        H.visitExploration(id);

        cy.findAllByLabelText("Ready", { timeout: 30000 })
          .first()
          .should("be.visible");

        cy.intercept("POST", "/api/exploration/thread/*/documents/*/append").as(
          "appendChart",
        );

        // Open the group-level doc menu — its first stage is the
        // chart picker (`Pick a chart` label). Clicking a chart
        // transitions the menu to the document picker (`Add to`
        // label).
        cy.findByLabelText("Add to document").click();
        cy.findByText("Pick a chart").should("be.visible");
        // The `Back` item is the chevron at the top of stage 2 —
        // assert it doesn't render until we pick a chart.
        cy.findByRole("menuitem", { name: /Back/i }).should("not.exist");

        // Charts are listed as menu items named after the query
        // (e.g. the base "By Created At" and the segmented
        // "Recent orders" or similar). Each picker entry corresponds
        // to one *SeriesGroup* — multi-series cartesian / heat-map
        // groups collapse to a single entry whose `queryIds` is the
        // group's full set. Mantine menu items aren't given individual
        // `data-testid`s, so we use the menu's role+position.
        cy.findAllByRole("menuitem").first().click();

        // Stage 2: documents picker. The `Back` chevron now
        // appears and the doc list is visible.
        cy.findByText("Add to").should("be.visible");
        cy.findByRole("menuitem", { name: /Back/i }).should("be.visible");
        // Mantine renders the leftSection icon's `aria-label` ("document
        // icon") into the menuitem's accessible name (it becomes
        // "document icon Scratchpad"), so we match by regex on the doc name.
        cy.findByRole("menuitem", { name: /Scratchpad/ }).click();
        cy.wait("@appendChart").then(({ request, response }) => {
          expect(response?.statusCode).to.eq(200);
          // The picked entry is a multi-query group (baseline + the
          // segmented variant created above), so the contract is the
          // full id list — verifies the FE composes the SeriesGroup
          // into one composite materialisation request rather than
          // falling back to per-query embeds.
          const ids = request.body.exploration_query_ids as number[];
          expect(ids).to.be.an("array");
          expect(ids.length).to.be.greaterThan(1);
        });

        // Same toast → navigate to doc → chart embed visible.
        cy.findByText("Added to").should("be.visible");
        cy.findByRole("link", { name: "Scratchpad" }).click();
        cy.url().should("include", `/question/research/${id}/document/`);
        // The N source snapshots are combined server-side into ONE
        // ephemeral card (composite path); the doc must render exactly
        // one cardEmbed — not N separate embeds, which would be the
        // pre-composite per-query behaviour.
        cy.findAllByTestId("document-card-embed").should("have.length", 1);
        cy.findByRole("button", { name: "Save" }).should("not.exist");
      },
    );
  });
});

describe("scenarios > explorations > collection placement + archive", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.enableExplorations();
    seedMetrics();
    H.resetSnowplow();
    H.enableTracking();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
    cy.task("stopMockLlmServer");
  });

  it("places a newly-created exploration in the creator's personal collection and lets the user move it to trash from there", () => {
    const explorationName = "Personal-collection archive fixture";

    H.createExplorationViaApi({ name: explorationName }).then(
      (explorationId) => {
        cy.request("GET", "/api/user/current").then(({ body: user }) => {
          const personalCollectionId = user.personal_collection_id as number;
          expect(
            personalCollectionId,
            "/api/user/current returns a personal collection id",
          ).to.be.a("number");

          cy.request("GET", `/api/exploration/${explorationId}`).then(
            ({ body }) => {
              expect(
                body.collection_id,
                "exploration lives in the creator's personal collection",
              ).to.eq(personalCollectionId);
            },
          );

          // Visit the personal collection and confirm the row
          // renders.
          H.visitCollection(personalCollectionId);
          cy.findByTestId("collection-table")
            .findByText(explorationName)
            .should("be.visible");

          // Open the row's overflow menu and click `Move to trash`.
          // Archiving an exploration goes through the centralized
          // `useSetArchive` hook → `PUT /api/exploration/:id
          // { archived: true }`.
          cy.intercept("PUT", `/api/exploration/${explorationId}`).as(
            "archiveExploration",
          );
          H.openCollectionItemMenu(explorationName);
          // The EntityItem dropdown renders each action as a
          // `<li aria-labelledby="...">`, not `role="menuitem"`,
          // so match the visible text instead.
          cy.findByText("Move to trash").click();

          cy.wait("@archiveExploration").then(({ request, response }) => {
            expect(request.body).to.deep.eq({ archived: true });
            expect(response?.statusCode).to.eq(200);
          });

          // After archive, the row disappears from the active
          // listing in the personal collection.
          cy.findByText("This collection is empty")
            .findByText(explorationName)
            .should("not.exist");

          // BE state agrees: a subsequent GET reports
          // `archived: true`.
          cy.request("GET", `/api/exploration/${explorationId}`).then(
            ({ body }) => {
              expect(body.archived, "exploration is archived").to.eq(true);
            },
          );

          H.undoToast().findByText("Trashed exploration").should("exist");
          H.undo();

          cy.findByTestId("collection-table")
            .findByText(explorationName)
            .should("be.visible");
        });
      },
    );
  });

  it("permanently deletes an archived exploration via the Delete permanently action on the /trash page", () => {
    // `ActionMenu`'s `handleDeletePermanently` previously routed
    // every non-collection model through the legacy entity factory
    // (`entityForObject`), which has no `explorations` entry — so
    // the delete crashed. The fix dispatches the RTKQ
    // `deleteExploration` mutation, which calls
    // `DELETE /api/exploration/:id` (a new BE endpoint that cascades
    // through threads/queries/documents via the FK tree).
    const explorationName = "Trash-page delete-permanently fixture";

    H.createExplorationViaApi({ name: explorationName }).then(
      (explorationId) => {
        cy.request("PUT", `/api/exploration/${explorationId}`, {
          archived: true,
        });

        cy.visit("/trash");
        cy.findByTestId("collection-table")
          .findByText(explorationName)
          .should("be.visible");

        cy.intercept("DELETE", `/api/exploration/${explorationId}`).as(
          "deleteExploration",
        );
        H.openCollectionItemMenu(explorationName);
        cy.findByText("Delete permanently").click();
        // The confirmation modal owns the final destructive button.
        H.modal()
          .findByRole("button", { name: /Delete permanently/i })
          .click();

        cy.wait("@deleteExploration")
          .its("response.statusCode")
          .should("eq", 204);

        // The row is gone from the trash listing…
        cy.findByText(explorationName).should("not.exist");

        // …and the BE returns 404 for the now-hard-deleted exploration.
        cy.request({
          method: "GET",
          url: `/api/exploration/${explorationId}`,
          failOnStatusCode: false,
        })
          .its("status")
          .should("eq", 404);
      },
    );
  });

  it("restores an archived exploration via the Restore action on the /trash page", () => {
    // `useSetArchive`'s undo toast is one path back, but the trash
    // page exposes a separate `Restore` action that runs through
    // `ActionMenu.tsx`'s `handleRestore`. Without an explicit
    // `exploration` branch in that handler it falls through to the
    // legacy `entityForObject(...)`, which has no `explorations`
    // entry — so the restore would silently throw. This test
    // exercises the dedicated branch end-to-end.
    const explorationName = "Trash-page restore fixture";

    H.createExplorationViaApi({ name: explorationName }).then(
      (explorationId) => {
        // Archive directly via the BE so we land on /trash with the
        // exploration already in it.
        cy.request("PUT", `/api/exploration/${explorationId}`, {
          archived: true,
        });

        cy.visit("/trash");
        cy.findByTestId("collection-table")
          .findByText(explorationName)
          .should("be.visible");

        cy.intercept("PUT", `/api/exploration/${explorationId}`).as(
          "restoreExploration",
        );
        H.openCollectionItemMenu(explorationName);
        cy.findByText("Restore").click();

        cy.wait("@restoreExploration").then(({ request, response }) => {
          expect(request.body).to.deep.eq({ archived: false });
          expect(response?.statusCode).to.eq(200);
        });

        // The trash listing no longer shows the exploration.
        cy.findByText(explorationName).should("not.exist");

        // And the BE reports the exploration as un-archived again.
        cy.request("GET", `/api/exploration/${explorationId}`).then(
          ({ body }) => {
            expect(body.archived, "exploration is no longer archived").to.eq(
              false,
            );
          },
        );
      },
    );
  });
});
