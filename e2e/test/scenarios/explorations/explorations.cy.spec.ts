import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import type {
  Exploration,
  GetExplorationDataResponse,
} from "metabase-types/api";

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
      // The response is unused, but `GET /api/metric/:id` calls
      // `sync-dimensions!` server-side, persisting the metric's dimensions
      // and dimension_mappings — which `/api/exploration/dimensions` needs.
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

  it("returns to the entry screen on browser back from the plan step and keeps the draft (UXW-4832)", () => {
    H.visitNewExploration();
    H.startManualExploration();

    cy.location("pathname").should("eq", "/question/research/plan");

    H.addMetricsAndDimensions({
      metrics: ["Count of orders"],
    });
    cy.findByTestId("research-content")
      .findByText("Count of orders")
      .should("be.visible");

    cy.go("back");

    // back steps within the research flow instead of leaving it
    cy.location("pathname").should("eq", "/question/research");
    cy.findByRole("main")
      .findByText(/What do you want to research\?/i)
      .should("be.visible");

    cy.go("forward");

    // the draft survives the round trip
    cy.location("pathname").should("eq", "/question/research/plan");
    cy.findByTestId("research-content")
      .findByText("Count of orders")
      .should("be.visible");
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
            // Unjustified type cast. FIXME
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
      // Unjustified type cast. FIXME
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
          toolCallId: "groups-1",
          toolName: "add_research_groups",
          result: {
            metrics: [firstMetric],
            dimension_groups: [interestingGroup],
            groups: [{ anchor: "metric", metric_id: firstMetric.id }],
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
        // Unjustified type cast. FIXME
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

      // `findAllByRole` → `filter` → `first` → `invoke` are all Cypress
      // queries, so a `.should` chained onto this re-runs the whole lookup
      // until the assertion passes. Trimming happens inside the `.should`
      // callbacks below — a `.then` here would freeze the subject and break
      // retryability.
      const selectedText = () => selectedRows().first().invoke("text");

      selectedText().then((initial: string) => {
        const initialText = initial.trim();

        // The keyboard handler attaches to `window` (see
        // `ExplorationSidebar.tsx`), so we fire the event on the
        // body.
        cy.get("body").type("{rightarrow}");
        selectedText().should((text: string) => {
          expect(text.trim()).not.to.eq(initialText);
        });

        cy.get("body").type("{leftarrow}");
        selectedText().should((text: string) => {
          expect(text.trim()).to.eq(initialText);
        });

        // ArrowRight onto the next page, ArrowLeft back onto the
        // initial one — and `expectUnstructuredSnowplowEvent` asserts
        // an exact count.
        H.expectUnstructuredSnowplowEvent(
          {
            event: "exploration_visualization_changed",
            triggered_from: "keyboard",
          },
          2,
        );
      });
    });
  });

  it("groups sidebar rows under their metric heading, makes the headings collapsible, and marks interesting groups", () => {
    cy.request("GET", "/api/exploration/dimensions").then(({ body }) => {
      // Unjustified type cast. FIXME
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
        // Settling matters here beyond query readiness: collapsing the
        // heading races the poll-driven tree rebuilds otherwise, and the
        // clicked heading node can be replaced mid-click.
        visitExplorationUntilSettled(id, pickedDimensions.length);

        // Deliberately no `.within()` here: a `within` captures the sidebar
        // node once, and background refetches can remount it (or its rows) —
        // after which every inner query runs against the detached old node
        // and times out. Fresh root-based chains re-query on every retry.
        const sidebarScope = () => cy.findByTestId("exploration-page-sidebar");
        const metricHeading = () =>
          sidebarScope().findByRole("group", { name: ordersMetric!.name });

        metricHeading().should("be.visible");
        for (const dim of pickedDimensions) {
          sidebarScope().findByText(dim.display_name).should("be.visible");
        }

        cy.log("Collapse the metric heading: both leaves disappear");
        metricHeading().should("have.attr", "aria-expanded", "true");
        metricHeading().click();
        metricHeading().should("have.attr", "aria-expanded", "false");
        for (const dim of pickedDimensions) {
          sidebarScope().findByText(dim.display_name).should("not.exist");
        }

        cy.log("Re-expand: both leaves return");
        metricHeading().click();
        metricHeading().should("have.attr", "aria-expanded", "true");
        for (const dim of pickedDimensions) {
          sidebarScope().findByText(dim.display_name).should("be.visible");
        }
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
    createTimelineWithSentinelEvent("Releases", "star").then((timelineId) => {
      cy.request("GET", "/api/exploration/dimensions").then(({ body }) => {
        // Unjustified type cast. FIXME
        const data = body as GetExplorationDataResponse;
        const temporalDimension = data.dimension_groups
          .flatMap((group) => group.dimensions)
          .find((dim) => dim.effective_type.includes("Date"));
        expect(temporalDimension, "sample DB exposes a temporal dimension").to
          .exist;

        H.createExplorationViaApi({
          name: "Timeline persistence fixture",
          timelineIds: [timelineId],
          dimensionIds: [temporalDimension!.id],
        }).then((id) => {
          cy.visit(`/question/research/${id}?timeline=${timelineId}`);
          // Sidebar treeitems appear once the BE returns query rows.
          cy.findAllByRole("treeitem", { timeout: 15000 })
            .first()
            .should("be.visible");

          cy.findByRole("treeitem", {
            name: new RegExp(`${temporalDimension!.display_name}$`), // anchor at end so we don't match day of week or hour of day
          }).click();

          cy.findByTestId("exploration-chart-grid").within(() => {
            H.timelineEventChip("Releases event").should("be.visible");
          });

          cy.location("search").should("include", `timeline=${timelineId}`);

          // Reload — the URL param is the source of truth and the
          // router shouldn't rewrite it away on hydration.
          cy.reload();
          cy.findAllByRole("treeitem", { timeout: 15000 })
            .first()
            .should("be.visible");
          cy.location("search").should("include", `timeline=${timelineId}`);

          cy.findByTestId("exploration-chart-grid").within(() => {
            H.timelineEventChip("Releases event").should("be.visible");
          });
        });
      });
    });
  });
});

/**
 * Resolve the "Count of orders" metric plus its first two dimensions and
 * create an exploration with them — yielding one metric-group heading with
 * exactly two dimension-named pages, the smallest deterministic tree for
 * sidebar-triage assertions.
 */
function createTwoPageExploration(name: string): Cypress.Chainable<{
  explorationId: number;
  metricName: string;
  pageNames: string[];
}> {
  return cy.request("GET", "/api/exploration/dimensions").then(({ body }) => {
    // Unjustified type cast. FIXME
    const data = body as GetExplorationDataResponse;
    const ordersMetric = data.metrics.find(
      (metric) => metric.name === "Count of orders",
    );
    expect(
      ordersMetric,
      '"Count of orders" metric is exposed by /api/exploration/dimensions',
    ).to.exist;
    const dimsById = new Map(
      data.dimension_groups.flatMap((group) =>
        group.dimensions.map((dim) => [dim.id, dim] as const),
      ),
    );
    const pickedDimensions = ordersMetric!.dimension_ids
      .map((id) => dimsById.get(id))
      .filter((dim) => dim != null)
      .slice(0, 2);
    expect(
      pickedDimensions.length,
      "metric exposes at least two dimensions",
    ).to.eq(2);

    return H.createExplorationViaApi({
      name,
      metricCardIds: [ordersMetric!.id],
      dimensionIds: pickedDimensions.map((dim) => dim!.id),
    }).then((explorationId) => ({
      explorationId,
      metricName: ordersMetric!.name,
      pageNames: pickedDimensions.map((dim) => dim!.display_name),
    }));
  });
}

/**
 * Visit an exploration and wait until it has fully settled. The "Ready" icons
 * only say every page's queries finished; the page keeps polling
 * `GET /api/exploration/:id` (rebuilding the sidebar tree on each response)
 * until the BE also stamps the thread's `completed_at` after its post-query
 * handling. Interact with the tree only after that final response, or clicks
 * can land on nodes a re-render just replaced.
 */
function visitExplorationUntilSettled(
  explorationId: number,
  expectedReadyCount: number,
): void {
  cy.intercept("GET", `/api/exploration/${explorationId}`).as("getExploration");
  H.visitExploration(explorationId);
  cy.findAllByLabelText("Ready", { timeout: 30000 }).should(
    "have.length",
    expectedReadyCount,
  );
  const awaitThreadCompletion = (attempt: number) => {
    cy.wait("@getExploration", { timeout: 30000 }).then(({ response }) => {
      // Unjustified type cast. FIXME
      const threads = (response?.body as Exploration).threads ?? [];
      if (!threads.every((thread) => thread.completed_at != null)) {
        expect(
          attempt,
          "exploration completes within the poll budget",
        ).to.be.lessThan(30);
        awaitThreadCompletion(attempt + 1);
      }
    });
  };
  awaitThreadCompletion(0);
}

describe("scenarios > explorations > sidebar triage", () => {
  const sidebar = () => cy.findByTestId("exploration-page-sidebar");
  const filterToggle = () => cy.findByTestId("exploration-show-hidden-toggle");
  const selectedRows = () =>
    cy.findAllByRole("treeitem").filter('[aria-selected="true"]');
  const toggleShowHiddenItems = () => {
    filterToggle().click();
    H.menu().findByText("Show hidden items").click();
    cy.get("body").type("{esc}");
  };

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

  it("filters pages with the Stars and Discussions tabs and persists the sort preference across reloads", () => {
    createTwoPageExploration("Sidebar tabs fixture").then(
      ({ explorationId, pageNames }) => {
        visitExplorationUntilSettled(explorationId, 2);

        cy.log("Stars tab is empty until something is starred");
        cy.findByRole("radio", { name: "Stars" }).click({ force: true });
        cy.location("search").should("include", "tab=stars");
        H.main().findByText("Nothing's been starred yet.").should("be.visible");
        cy.findAllByRole("treeitem").should("not.exist");

        cy.log("Discussions tab shows its own empty message");
        cy.findByRole("radio", { name: "Discussions" }).click({ force: true });
        H.main().findByText("No discussions yet.").should("be.visible");
        cy.findAllByRole("treeitem").should("not.exist");

        cy.log("Star the selected page with the s shortcut");
        cy.findByRole("radio", { name: "All" }).click({ force: true });
        cy.findAllByRole("treeitem").should("have.length", 2);
        sidebar().findByText(pageNames[0]).click();
        selectedRows().should("contain.text", pageNames[0]);
        cy.intercept("PUT", "/api/exploration/page/*/starred").as("setStarred");
        cy.get("body").type("s");
        cy.wait("@setStarred").its("request.body.starred").should("eq", true);
        H.main()
          .findByRole("button", { name: "Remove star" })
          .should("be.visible");

        cy.log("The c shortcut opens the comment editor");
        cy.get("body").type("c");
        // The editor's placeholder is CSS-rendered by TipTap (not real text),
        // so anchor on the editor's Send button instead. The popover is
        // portaled outside <main>.
        H.popover().findByRole("button", { name: "Send" }).should("be.visible");
        H.main().findByRole("button", { name: "Add comment" }).click();
        cy.findByRole("button", { name: "Send" }).should("not.exist");

        cy.log("The l shortcut copies a link to the selected page");
        // Headless Chrome denies real clipboard access here (NotAllowedError),
        // so stub the write and assert the call instead of reading it back.
        cy.window().then((win) => {
          cy.stub(win.navigator.clipboard, "writeText")
            .as("copyToClipboard")
            .resolves();
        });
        cy.get("body").type("l");
        H.undoToastListContainer()
          .findByText("Copied link")
          .should("be.visible");
        cy.location("href").then((href) => {
          cy.get("@copyToClipboard").should("have.been.calledWith", href);
        });

        cy.log("Stars tab now shows only the starred page");
        cy.findByRole("radio", { name: "Stars" }).click({ force: true });
        cy.findAllByRole("treeitem")
          .should("have.length", 1)
          .first()
          .should("contain.text", pageNames[0]);

        cy.log("Alphabetical sort is remembered per exploration");
        cy.findByRole("radio", { name: "All" }).click({ force: true });
        filterToggle().should("have.attr", "aria-pressed", "false").click();
        H.menu().findByText("Alphabetical").click();
        H.menu()
          .findByRole("menuitem", { name: /Alphabetical/ })
          .should("have.attr", "data-checked", "true");
        cy.get("body").type("{esc}");
        cy.log("Sorting is not a filter, so the toggle stays unfilled");
        filterToggle().should("have.attr", "aria-pressed", "false");

        cy.reload();
        cy.findAllByRole("treeitem", { timeout: 15000 })
          .first()
          .should("be.visible");
        filterToggle().should("have.attr", "aria-pressed", "false").click();
        H.menu()
          .findByRole("menuitem", { name: /Alphabetical/ })
          .should("have.attr", "data-checked", "true");
      },
    );
  });

  it("hides pages from the toolbar and group menus, reveals them via Show hidden items, and keeps Initial investigation when everything is hidden", () => {
    createTwoPageExploration("Sidebar hide fixture").then(
      ({ explorationId, metricName, pageNames }) => {
        cy.intercept("PUT", "/api/exploration/pages/hidden").as(
          "setPagesHidden",
        );
        visitExplorationUntilSettled(explorationId, 2);

        // The page auto-selects the tree's first page on load, and the tree
        // orders pages by interestingness — so which of the two
        // dimension-named pages is selected is data-dependent; derive it
        // from the DOM instead of assuming.
        cy.findAllByRole("treeitem").should("have.length", 2);
        selectedRows().should("have.length", 1);
        selectedRows()
          .first()
          .invoke("text")
          .then((text) => {
            const firstPageName = text.trim();
            const secondPageName = pageNames.find(
              (name) => name !== firstPageName,
            )!;

            cy.log("Triage arrows step between pages");
            cy.findByRole("button", { name: "Previous" }).should("be.disabled");
            cy.findByRole("button", { name: "Next" }).click();
            selectedRows().should("contain.text", secondPageName);
            cy.findByRole("button", { name: "Previous" }).click();
            selectedRows().should("contain.text", firstPageName);

            cy.log("Hide the selected page with the h shortcut");
            cy.get("body").type("h");
            cy.wait("@setPagesHidden").then(({ request }) => {
              expect(request.body.hidden).to.eq(true);
              expect(request.body.page_ids).to.have.length(1);
            });
            H.undoToastListContainer()
              .findByText(`"${firstPageName}" hidden`)
              .should("be.visible");

            cy.log("Auto-advance moves the selection to the remaining page");
            selectedRows().should("contain.text", secondPageName);
            cy.findAllByRole("treeitem").should("have.length", 1);
            sidebar().findByText(firstPageName).should("not.exist");

            cy.log("Show hidden items reveals the page with a Hidden marker");
            toggleShowHiddenItems();
            filterToggle().should("have.attr", "aria-pressed", "true");
            sidebar().findByText(firstPageName).should("be.visible");
            sidebar().findAllByLabelText("Hidden").should("have.length", 1);
            toggleShowHiddenItems();
            cy.findAllByRole("treeitem").should("have.length", 1);
            sidebar().findByText(firstPageName).should("not.exist");
          });

        cy.log("Hide the whole group from its actions menu");
        sidebar()
          .findByRole("group", { name: metricName })
          .findByRole("button", { name: "Group actions" })
          .click({ force: true });
        H.menu().findByText("Hide").click();
        cy.wait("@setPagesHidden")
          .its("request.body.hidden")
          .should("eq", true);
        H.undoToastListContainer()
          .findByText(`${metricName} hidden`)
          .should("be.visible");

        cy.log(
          "Initial investigation stays, expanded, with an all-hidden note",
        );
        sidebar()
          .findByText("All items have been hidden.")
          .should("be.visible");
        sidebar()
          .findAllByRole("group")
          .should("have.length", 1)
          .first()
          .should("have.attr", "aria-expanded", "true")
          .and("have.attr", "aria-label", "Initial investigation");
        cy.findAllByRole("treeitem").should("not.exist");

        cy.log("Hidden state is persisted server-side across a reload");
        cy.reload();
        sidebar()
          .findByText("All items have been hidden.", { timeout: 15000 })
          .should("be.visible");

        cy.log("Show hidden items + the group Show action restore the pages");
        toggleShowHiddenItems();
        cy.findAllByRole("treeitem").should("have.length", 2);
        sidebar().findAllByLabelText("Hidden").should("have.length", 2);
        sidebar()
          .findByRole("group", { name: metricName })
          .findByRole("button", { name: "Group actions" })
          .click({ force: true });
        H.menu().findByText("Show").click();
        cy.wait("@setPagesHidden")
          .its("request.body.hidden")
          .should("eq", false);
        cy.findAllByRole("treeitem").should("have.length", 2);
        sidebar().findAllByLabelText("Hidden").should("not.exist");

        cy.log("Hiding the group with every page visible sends both page ids");
        toggleShowHiddenItems();
        cy.findAllByRole("treeitem").should("have.length", 2);
        sidebar()
          .findByRole("group", { name: metricName })
          .findByRole("button", { name: "Group actions" })
          .click({ force: true });
        H.menu().findByText("Hide").click();
        cy.wait("@setPagesHidden").then(({ request }) => {
          expect(request.body.hidden).to.eq(true);
          expect(request.body.page_ids).to.have.length(2);
        });
        sidebar()
          .findByText("All items have been hidden.")
          .should("be.visible");

        cy.log("Undo on the group-hidden toast restores the whole group");
        H.undoToastListContainer()
          .findByText(`${metricName} hidden`)
          .should("be.visible");
        H.undoToastListContainer()
          .findByRole("button", { name: "Undo" })
          .click();
        cy.wait("@setPagesHidden")
          .its("request.body.hidden")
          .should("eq", false);
        cy.findAllByRole("treeitem").should("have.length", 2);
        sidebar().findByText("All items have been hidden.").should("not.exist");
      },
    );
  });
});

describe("scenarios > explorations > chart click-through", () => {
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

  it("clicking a cartesian point opens Explore further + Add comment, posts explore-further filters, and navigates from the new-thread toast", () => {
    createTimelineWithSentinelEvent("Releases", "star").then((timelineId) => {
      cy.request("GET", "/api/exploration/dimensions").then(({ body }) => {
        // Unjustified type cast. FIXME
        const data = body as GetExplorationDataResponse;
        const ordersMetric = data.metrics.find(
          (metric) => metric.name === "Count of orders",
        );
        expect(
          ordersMetric,
          '"Count of orders" metric is exposed by /api/exploration/dimensions',
        ).to.exist;
        const dimsById = new Map(
          data.dimension_groups.flatMap((group) =>
            group.dimensions.map((dim) => [dim.id, dim] as const),
          ),
        );
        const dimension = ordersMetric!.dimension_ids
          .map((id) => dimsById.get(id))
          .find((dim) => dim != null && dim.display_name === "Category");
        expect(
          dimension,
          "orders metric exposes at least one non-temporal dimension",
        ).to.exist;

        H.createExplorationViaApi({
          name: "Chart click-through fixture",
          metricCardIds: [ordersMetric!.id],
          dimensionIds: [dimension!.id],
          timelineIds: [timelineId],
        }).then((explorationId) => {
          let initialThreadIds: number[] = [];

          cy.intercept(
            "POST",
            `/api/exploration/${explorationId}/explore-further`,
          ).as("exploreFurther");

          cy.visit(
            `/question/research/${explorationId}?timeline=${timelineId}`,
          );
          cy.findAllByRole("treeitem", { timeout: 30000 })
            .first()
            .should("be.visible");

          cy.request("GET", `/api/exploration/${explorationId}`).then(
            ({ body }) => {
              // Unjustified type cast. FIXME
              const exploration = body as Exploration;
              initialThreadIds = (exploration.threads ?? []).map(
                (thread) => thread.id,
              );
            },
          );

          cy.findByTestId("exploration-page-sidebar").within(() => {
            cy.findByRole("group", { name: ordersMetric!.name }).then(
              ($group) => {
                if ($group.attr("aria-expanded") !== "true") {
                  cy.wrap($group).click();
                }
              },
            );
            cy.findByRole("treeitem", {
              name: new RegExp(dimension!.display_name),
            })
              .first()
              .click();
          });

          cy.location("pathname").should("include", "/page/");
          cy.location("pathname").then((pathname) => {
            const match = pathname.match(/\/page\/(\d+)/);
            expect(match, "selected page is reflected in the URL").to.exist;
            cy.wrap(Number(match![1])).as("pageId");
          });

          // Wait for the selected page's queries to settle before clicking
          // the chart — `Ready` is the settled-state icon label.
          cy.findAllByLabelText("Ready", { timeout: 30000 })
            .first()
            .should("be.visible");

          H.chartPathWithFillColor("#509EE3").first().click({ force: true });

          cy.findByTestId("click-actions-view").within(() => {
            cy.findByRole("button", { name: /Explore further/i }).should(
              "be.visible",
            );
            cy.findByRole("button", { name: /Add comment/i }).should(
              "be.visible",
            );
          });

          cy.findByTestId("click-actions-view")
            .findByRole("button", { name: /Explore further/i })
            .click();

          cy.wait("@exploreFurther").then(({ request, response }) => {
            cy.get("@pageId").then((pageId) => {
              expect(request.body.page_id).to.eq(pageId);
            });
            expect(request.body.explore_filters).to.be.an("array").and.not.be
              .empty;
            expect(request.body.explore_filters[0]).to.include.keys(
              "field_ref",
              "value",
              "display_value",
            );

            // Unjustified type cast. FIXME
            const threads = (response?.body as Exploration).threads ?? [];
            const newThread = threads.find(
              (thread) => !initialThreadIds.includes(thread.id),
            );
            expect(newThread, "explore-further adds a new thread").to.exist;
            cy.wrap(newThread!.name).as("newThreadName");
          });

          // The FE polls every 2s while the new thread's queries are in flight,
          // then toasts once its first page lands. Timing is covered by
          // ExplorationPage.unit.spec.tsx — here we just wait for the real BE.
          cy.get("@newThreadName").then((name) => {
            cy.findByText(`Added ${name}`, { timeout: 60000 }).should(
              "be.visible",
            );
          });

          cy.findByRole("button", { name: "View" }).click();

          cy.location("pathname").should(
            "include",
            `/question/research/${explorationId}/page/`,
          );
          cy.location("search").should("include", "tab=all");
          cy.location("search").should("include", `timeline=${timelineId}`);

          cy.get("@newThreadName").then((name) => {
            cy.findByRole("group", { name: String(name) }).should(
              "have.attr",
              "aria-expanded",
              "true",
            );
          });

          cy.findByRole("main")
            .findByTestId("exploration-chart-grid")
            .should("exist");
        });
      });
    });
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
          // Unjustified type cast. FIXME
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

          // After archive, the collection shows its empty state and
          // the exploration row is gone from the page.
          cy.findByText("This collection is empty").should("be.visible");
          cy.findByText(explorationName).should("not.exist");

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
