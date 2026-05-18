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

describe("scenarios > explorations > new research > manual flow", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.enableExplorations();
    seedMetrics();
    // Match by pathname so the alias fires for both the initial
    // mount request AND debounced search refetches like
    // `/api/exploration/dimensions?q=over%20time` (the string-form
    // intercept matches against the full URL incl. query string).
    cy.intercept({
      method: "GET",
      pathname: "/api/exploration/dimensions",
    }).as("getDimensions");
  });

  it("renders the empty research-mode landing with a disabled CTA", () => {
    H.visitNewExploration();

    cy.findByRole("heading", {
      name: /What do you want to research\?/i,
    }).should("be.visible");

    H.explorationsMetabotPromptInput().should("be.visible");
    // Two top-level section headers — Data + Timelines.
    cy.findByRole("main").findByText("Data").should("be.visible");
    cy.findByRole("main").findByText("Timelines").should("be.visible");
    // Metrics / Dimensions accordion items only appear once data
    // has been picked (the `hasMetricsOrDimensions` branch in
    // `NewExplorationData.tsx`); confirm they're absent right now.
    cy.findByRole("main").findByText("Metrics").should("not.exist");
    cy.findByRole("main").findByText("Dimensions").should("not.exist");
    // CTA disabled until metrics + dimensions are both selected.
    cy.findByRole("button", { name: /Begin research/i }).should("be.disabled");
  });

  it("QuestionModeSwitcher toggles between /question/ask and /question/research", () => {
    H.visitNewExploration();

    // Click the Explore segment → MetabotQueryBuilder.
    cy.findByRole("radio", { name: "Explore" }).check({ force: true });
    cy.url().should("include", "/question/ask");
    // The metabot send-button only renders inside the
    // MetabotQueryBuilder shell.
    cy.findByTestId("metabot-send-message").should("be.visible");

    // Back to Research.
    cy.findByRole("radio", { name: "Research" }).check({ force: true });
    cy.url().should("include", "/question/research");
    cy.findByRole("heading", {
      name: /What do you want to research\?/i,
    }).should("be.visible");
  });

  it("picks metrics + dimensions, creates an exploration, and lands on the detail page", () => {
    H.visitNewExploration();

    H.addMetricsAndDimensions({
      metrics: ["Count of orders"],
    });

    // After the modal Done, the right panel transitions from the
    // empty 2-card layout to the 3-section accordion.
    cy.findByRole("main").findByText("Metrics").should("be.visible");
    cy.findByRole("main").findByText("Dimensions").should("be.visible");
    // Metric pill is rendered.
    cy.findByRole("main").findByText("Count of orders").should("be.visible");

    H.beginResearch().then((id) => {
      // Detail page (`/question/research/:id`) renders. The BE
      // defaults `name` to "New exploration" when the user hasn't
      // set one — see `buildCreateExplorationRequest` in
      // `NewExplorationData.tsx`.
      cy.url().should("include", `/question/research/${id}`);
      // No new-exploration CTA on the detail page.
      cy.findByRole("button", { name: /Begin research/i }).should("not.exist");
    });
  });

  it("filters the picker by typing into the search inputs of the metrics + timelines modals", () => {
    cy.request("POST", "/api/timeline", {
      name: "Releases",
      collection_id: null,
      icon: "star",
      default: false,
    });
    cy.request("POST", "/api/timeline", {
      name: "Marketing campaigns",
      collection_id: null,
      icon: "bell",
      default: false,
    });

    H.visitNewExploration();

    // --- Metrics modal search ---
    cy.findByRole("button", { name: /Add metrics and dimensions/i }).click();
    H.modal().within(() => {
      // Seeded names are "Count of orders" + "Count of orders over time".
      cy.wait("@getDimensions");
      cy.findByRole("checkbox", { name: "Count of orders" }).should("exist");
      cy.findByRole("checkbox", { name: "Count of orders over time" }).should(
        "exist",
      );

      // Type a substring that only matches the timeseries metric.
      cy.findByPlaceholderText("Search for metrics or dimensions").type(
        "over time",
      );
      // Debounced refetch.
      cy.wait("@getDimensions");
      cy.findByRole("checkbox", { name: "Count of orders over time" }).should(
        "exist",
      );
      cy.findByRole("checkbox", { name: "Count of orders" }).should(
        "not.exist",
      );

      // Clear the input → both rows return. We don't `cy.wait` on
      // `@getDimensions` here because RTK Query caches the
      // empty-`q` response from the initial mount and skips the
      // network round-trip; we assert on the visible result
      // instead.
      cy.findByPlaceholderText("Search for metrics or dimensions").clear();
      cy.findByRole("checkbox", { name: "Count of orders" }).should("exist");
      cy.findByRole("checkbox", { name: "Count of orders over time" }).should(
        "exist",
      );

      // Search for something that matches no metric → empty state copy.
      cy.findByPlaceholderText("Search for metrics or dimensions").type(
        "zzz no such metric",
      );
      cy.wait("@getDimensions");
      cy.findByText("No metrics found").should("be.visible");

      cy.findByRole("button", { name: "Close" }).click();
    });

    // --- Timelines modal search ---
    cy.findByRole("button", { name: /Add timelines/i }).click();
    H.modal().within(() => {
      cy.findByRole("checkbox", { name: "Releases" }).should("exist");
      cy.findByRole("checkbox", { name: "Marketing campaigns" }).should(
        "exist",
      );

      // Filter to just one timeline by name fragment.
      cy.findByPlaceholderText("Search for timelines").type("release");
      cy.findByRole("checkbox", { name: "Releases" }).should("exist");
      cy.findByRole("checkbox", { name: "Marketing campaigns" }).should(
        "not.exist",
      );

      // Clear → both return.
      cy.findByPlaceholderText("Search for timelines").clear();
      cy.findByRole("checkbox", { name: "Releases" }).should("exist");
      cy.findByRole("checkbox", { name: "Marketing campaigns" }).should(
        "exist",
      );

      // No match → empty-state copy (`AddTimelinesModal.tsx`
      // line 147).
      cy.findByPlaceholderText("Search for timelines").type("zzz");
      cy.findByText("No timelines found").should("be.visible");
    });
  });

  it("picks one or more timelines via the AddTimelinesModal and POSTs them with the exploration", () => {
    function createTimeline(name: string, icon: string) {
      return cy
        .request("POST", "/api/timeline", {
          name,
          collection_id: null,
          icon,
          default: false,
        })
        .then(({ body }: { body: { id: number } }) => body.id);
    }

    createTimeline("Releases", "star").then((releasesId) => {
      createTimeline("Marketing campaigns", "bell").then((marketingId) => {
        H.visitNewExploration();
        // Need at least one metric + dimension first — that's the
        // `canStart` gate from `NewExplorationData.tsx`.
        H.addMetricsAndDimensions({ metrics: ["Count of orders"] });

        // Pick two timelines in a single modal session.
        H.addTimelinesToExploration(["Releases", "Marketing campaigns"]);

        // Both timeline pills now live under the `Timelines`
        // section in the right panel (see the `PillList` branch in
        // `NewExplorationData.tsx`).
        cy.findByRole("main").findByText("Releases").should("be.visible");
        cy.findByRole("main")
          .findByText("Marketing campaigns")
          .should("be.visible");

        // Verify the request body forwards both ids in pick order
        // and that we still land on the detail page. We can't use
        // `H.beginResearch` here because we need to assert on the
        // intercept's request body before it's consumed by the
        // helper's `cy.wait`, so we drive the click + wait inline.
        cy.intercept("POST", "/api/exploration").as("createExploration");
        cy.findByRole("button", { name: /Begin research/i }).click();
        cy.wait("@createExploration").then(({ request, response }) => {
          expect(request.body.timeline_ids).to.deep.eq([
            releasesId,
            marketingId,
          ]);
          const id = response?.body?.id as number;
          cy.url().should("include", `/question/research/${id}`);
        });
      });
    });
  });
});

describe("scenarios > explorations > new research > metabot flow", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.enableExplorations();
    seedMetrics();
    cy.intercept({
      method: "GET",
      pathname: "/api/exploration/dimensions",
    }).as("getDimensions");
  });

  it("auto-populates metrics + dimensions + name from agent tool calls, then Begin research succeeds", () => {
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
          toolName: "select_exploration_metrics",
          result: {
            metrics: [firstMetric],
            dimension_groups: [interestingGroup],
          },
        },
        {
          toolCallId: "name-1",
          toolName: "set_exploration_name",
          result: { name: agentName },
        },
      ]);

      H.visitNewExploration();

      H.explorationsMetabotPromptInput().type("Why are signups down?");
      cy.findByTestId("metabot-send-message").click();

      // The chat dispatch went through with the `explorations`
      // profile, confirming we wired the new-exploration page to
      // the right agent.
      cy.wait("@metabotAgent")
        .its("request.body.profile_id")
        .should("eq", "explorations");

      // Right panel hydrated from the tool-call result.
      cy.findByRole("main").findByText("Metrics").should("be.visible");
      cy.findByRole("main").findByText("Dimensions").should("be.visible");
      cy.findByRole("main").findByText(firstMetric.name).should("be.visible");

      // Click Begin research; the create-exploration POST body
      // should carry the name the agent picked.
      cy.intercept("POST", "/api/exploration").as("createExploration");
      cy.findByRole("button", { name: /Begin research/i }).click();
      cy.wait("@createExploration").then(({ request }) => {
        expect(request.body.name).to.eq(agentName);
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
  });

  it("auto-selects a sidebar entity on first load and toggles via ArrowRight/ArrowLeft", () => {
    H.createExplorationViaApi({ name: "Keyboard nav fixture" }).then((id) => {
      H.visitExploration(id);

      // After landing, the page auto-selects the most-interesting
      // entity (see `ExplorationPage` selection logic). The
      // `ExplorationTreeItem` is a `<button role="listitem">` and
      // toggles `aria-pressed`; testing-library's
      // `{ pressed: true }` filter rejects that combo because
      // `aria-pressed` is only formally valid on `role="button"`,
      // so we use a CSS attribute selector to find pressed rows.
      //
      // Read the pressed id through Cypress's reactive query (so
      // we don't hold a stale subject across the re-renders the
      // keyboard handler triggers).
      // Testing-library's `findByRole("listitem", { pressed: true })`
      // rejects the combo (aria-pressed is formally only valid on
      // role="button"), so we list every listitem and filter
      // jQuery-side. The `ExplorationTreeItem` UnstyledButton has
      // no `id` attribute, so we identify the row by its trimmed
      // text content (group/query name). Each pressed-state read
      // goes through a fresh selector so the detached-subject
      // error can't bite after a keyboard-driven re-render.
      const pressedRows = () =>
        cy.findAllByRole("listitem").filter('[aria-pressed="true"]');

      pressedRows().should("have.length.at.least", 1);

      const readPressedText = () =>
        pressedRows()
          .first()
          .invoke("text")
          .then((s: string) => s.trim());

      readPressedText().then((initialText) => {
        cy.wrap(initialText).as("initialText");

        // The keyboard handler attaches to `window` (see
        // `ExplorationSidebar.tsx`), so we fire the event on the
        // body.
        cy.get("body").type("{rightarrow}");
        readPressedText().should("not.eq", initialText);

        cy.get("body").type("{leftarrow}");
        readPressedText().should("eq", initialText);
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

        // Headings are `UnstyledButton`s with `aria-expanded`,
        // accessible by their text content (the metric name).
        // Leaf rows are also UnstyledButtons but with `role="listitem"`
        // — ARIA's name-computation algorithm doesn't derive a
        // listitem's accessible name from its text content, so
        // `findByRole("listitem", { name })` won't match. We use
        // `findByText` for the visible `By <dim>` label instead;
        // it matches the inner `<Text>` rendered by `Ellipsified`.
        const metricHeading = () =>
          cy.findByRole("button", { name: ordersMetric!.name });

        metricHeading().should("be.visible");
        for (const dim of pickedDimensions) {
          cy.findByText(`By ${dim.display_name}`).should("be.visible");
        }

        // Collapse the metric heading: aria-expanded flips and
        // both leaves disappear.
        metricHeading()
          .should("have.attr", "aria-expanded", "true")
          .click()
          .should("have.attr", "aria-expanded", "false");
        for (const dim of pickedDimensions) {
          cy.findByText(`By ${dim.display_name}`).should("not.exist");
        }

        // Re-expand: both leaves return.
        metricHeading().click().should("have.attr", "aria-expanded", "true");
        for (const dim of pickedDimensions) {
          cy.findByText(`By ${dim.display_name}`).should("be.visible");
        }

        // Interestingness marker: read the hydrated exploration to
        // know how many leaf groups cross the FE threshold (0.7 —
        // see `frontend/src/metabase/explorations/constants.ts`),
        // and assert the same number of markers render in the
        // sidebar. If the BE marks none as interesting, no markers
        // should appear at all.
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
        // that row owns `aria-pressed=true`.
        cy.findAllByRole("listitem").first().click();
        cy.findAllByRole("listitem")
          .first()
          .should("have.attr", "aria-pressed", "true");

        // Main area renders something — scope to `main` to avoid
        // matching the sidebar copy.
        cy.findByRole("main").should("not.be.empty");
      },
    );
  });

  it("renders the sticky x-axis only when the chart overflows the viewport", () => {
    H.createExplorationViaApi({ name: "Sticky axis fixture" }).then((id) => {
      // Tall viewport — chart fits, no sticky needed.
      cy.viewport(1280, 1400);
      H.visitExploration(id);

      // Wait until at least one sidebar item shows the "Ready"
      // icon (added by `ExplorationTreeItemIcon` once the query
      // has results).
      cy.findAllByLabelText("Ready", { timeout: 30000 })
        .first()
        .should("be.visible");
      // Sticky axis only renders for cartesian groups under the
      // overflow condition (see `CartesianPageBody`'s
      // `shouldShowStickyAxis` in `ExplorationGroupVisualization.tsx`).
      cy.findByTestId("exploration-sticky-x-axis").should("not.exist");

      // Shrink the viewport — same chart now overflows, the
      // sticky axis appears.
      cy.viewport(1280, 500);
      cy.findByTestId("exploration-sticky-x-axis").should("be.visible");
    });
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
        // Sidebar listitems appear once the BE returns query rows.
        cy.findAllByRole("listitem", { timeout: 15000 })
          .first()
          .should("be.visible");
        cy.location("search").should("include", `timeline=${timelineId}`);

        // Reload — the URL param is the source of truth and the
        // router shouldn't rewrite it away on hydration.
        cy.reload();
        cy.findAllByRole("listitem", { timeout: 15000 })
          .first()
          .should("be.visible");
        cy.location("search").should("include", `timeline=${timelineId}`);
      });
    });
  });

  it("auto-creates Scratchpad + Automatic Insights documents under the Findings sidebar heading, with a Move to trash action in each doc's three-dots menu", () => {
    H.createExplorationViaApi({ name: "Documents fixture" }).then((id) => {
      H.visitExploration(id);

      // Expand the `Findings` heading so its child rows render
      const findingsHeading = () =>
        cy.findByRole("button", { name: "Findings" });
      findingsHeading()
        .should("have.attr", "aria-expanded")
        .then((expanded) => {
          if (expanded !== "true") {
            findingsHeading().click();
          }
        });

      cy.findByText("Automatic Insights").should("be.visible");
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
        const autoDoc = docs.find((d) => d.name === "Automatic Insights");
        expect(scratchpadDoc, "BE created a Scratchpad document").to.exist;
        expect(autoDoc, "BE created an Automatic Insights document").to.exist;

        for (const doc of [scratchpadDoc!, autoDoc!]) {
          cy.visit(`/question/research/${id}/document/${doc.id}`);
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

  it("adds a single chart to the Scratchpad document via the Add to document button and lands on the document", () => {
    H.createExplorationViaApi({ name: "Single-chart add fixture" }).then(
      (id) => {
        H.visitExploration(id);

        // Wait until the BE finishes a query so the chart page
        // renders the `Add to document` button.
        cy.findAllByLabelText("Ready", { timeout: 30000 })
          .first()
          .should("be.visible");

        // Auto-selection lands on the most-interesting leaf, which
        // is always a single-query group (segments aren't seeded
        // in this test). Click the doc-menu button → `Scratchpad`.
        cy.intercept("POST", "/api/exploration/thread/*/documents/*/append").as(
          "appendChart",
        );
        cy.findByLabelText("Add to document").click();
        // Mantine renders the leftSection icon's `aria-label` ("document
        // icon") into the menuitem's accessible name (it becomes
        // "document icon Scratchpad"), so we match by regex on the doc name.
        cy.findByRole("menuitem", { name: /Scratchpad/ }).click();
        cy.wait("@appendChart").then(({ response }) => {
          expect(response?.statusCode).to.eq(200);
        });

        // Toast renders with a link whose text is the doc name.
        cy.findByText("Added to").should("be.visible");
        cy.findByRole("link", { name: "Scratchpad" }).click();

        // Detail page renders with the embedded chart.
        cy.url().should("include", `/question/research/${id}/document/`);
        // The exploration document page renders chart embeds via
        // `StaticCardEmbedNode` (`data-testid="document-static-card-embed"`)
        // instead of the interactive editor's `CardEmbedNode`
        // (`document-card-embed`), so we match either with a
        // regex testid.
        cy.findByTestId(/document-(static-)?card-embed/).should("be.visible");
      },
    );
  });

  it("flips the Automatic Insights doc from running → done when the BE marks the thread complete, surfaces a toast, and renders the finished body when opened", () => {
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
                text: "Automatic Insights is generating an analysis…",
                marks: [{ type: "italic" }],
              },
            ],
          },
        ],
      };

      // Force the auto-insights doc into the "running" state
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
              auto_insights_document_id: number | null;
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
              doc.id === thread.auto_insights_document_id
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

      // Expand the `Findings` sidebar heading so the auto-insights
      // doc row is in the DOM. (It starts collapsed; the heading
      // is named after the user-doc, which shares the literal
      // string — only the heading button has aria-expanded.)
      cy.findByRole("button", { name: "Findings" })
        .should("have.attr", "aria-expanded")
        .then((expanded) => {
          if (expanded !== "true") {
            cy.findByRole("button", { name: "Findings" }).click();
          }
        });

      // Pre-completion: the Automatic Insights doc row shows the
      // Loading spinner (aria-label "Loading…"). Scope the
      // assertion to the sidebar (the `<nav>` element) so we
      // don't accidentally match an app-bar Loader.
      cy.findByText("Automatic Insights")
        .closest('[role="listitem"]')
        .findByLabelText("Loading…")
        .should("be.visible");

      // Look up the auto-insights doc id so we can target the
      // doc-fetch intercept precisely.
      cy.request("GET", `/api/exploration/${id}`).then(({ body }) => {
        const autoDocId = (body.threads ?? [])
          .map(
            (t: { auto_insights_document_id: number | null }) =>
              t.auto_insights_document_id,
          )
          .find((d: number | null) => d != null);
        expect(autoDocId, "BE set auto_insights_document_id").to.be.a("number");

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
        // auto-insights doc, so the action renders).
        cy.findByText("Automatic Insights ready", { timeout: 10000 }).should(
          "be.visible",
        );

        // Sidebar icon flips: the auto-insights doc row now
        // exposes the `Ready` aria-label instead of `Loading…`.
        cy.findByText("Automatic Insights")
          .closest('[role="listitem"]')
          .findByLabelText("Ready")
          .should("be.visible");

        // Click the toast's `View` action → navigates to the
        // auto-insights doc page.
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
        // "Recent orders" or similar). Pick the first one — the
        // Mantine menu items aren't given individual `data-testid`s,
        // so we use the menu's role+position.
        cy.findAllByRole("menuitem").first().click();

        // Stage 2: documents picker. The `Back` chevron now
        // appears and the doc list is visible.
        cy.findByText("Add to").should("be.visible");
        cy.findByRole("menuitem", { name: /Back/i }).should("be.visible");
        // Mantine renders the leftSection icon's `aria-label` ("document
        // icon") into the menuitem's accessible name (it becomes
        // "document icon Scratchpad"), so we match by regex on the doc name.
        cy.findByRole("menuitem", { name: /Scratchpad/ }).click();
        cy.wait("@appendChart").then(({ response }) => {
          expect(response?.statusCode).to.eq(200);
        });

        // Same toast → navigate to doc → chart embed visible.
        cy.findByText("Added to").should("be.visible");
        cy.findByRole("link", { name: "Scratchpad" }).click();
        cy.url().should("include", `/question/research/${id}/document/`);
        // The exploration document page renders chart embeds via
        // `StaticCardEmbedNode` (`data-testid="document-static-card-embed"`)
        // instead of the interactive editor's `CardEmbedNode`
        // (`document-card-embed`), so we match either with a
        // regex testid.
        cy.findByTestId(/document-(static-)?card-embed/).should("be.visible");
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

          // Sanity-check the BE: the exploration row exists with
          // collection_id = personal collection.
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
});
