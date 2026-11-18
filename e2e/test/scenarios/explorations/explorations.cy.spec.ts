import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import type {
  Exploration,
  GetExplorationDataResponse,
} from "metabase-types/api";

const { H } = cy;
const { ORDERS_ID, ORDERS, PRODUCTS } = SAMPLE_DATABASE;

type StructuredQuestionDetailsWithName = StructuredQuestionDetails & {
  name: string;
};

const ORDERS_COUNT_METRIC_NAME = "Count of orders";
const ORDERS_COUNT_METRIC: StructuredQuestionDetailsWithName = {
  name: ORDERS_COUNT_METRIC_NAME,
  type: "metric" as const,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar" as const,
};

const ORDERS_TIMESERIES_METRIC_NAME = "Count of orders over time";
const ORDERS_TIMESERIES_METRIC: StructuredQuestionDetailsWithName = {
  name: ORDERS_TIMESERIES_METRIC_NAME,
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
  minReadyCount: number,
): void {
  cy.intercept("GET", `/api/exploration/${explorationId}`).as("getExploration");
  H.visitExploration(explorationId);
  cy.findAllByLabelText("Ready", { timeout: 30000 }).should(
    "have.length.at.least",
    minReadyCount,
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

/**
 * The FE polls every 2s while the new thread's queries are in flight, then
 * toasts once its first page lands. Timing is covered by
 * ExplorationPage.unit.spec.tsx — here we just wait for the real BE.
 * Scoped to the toast container so we don't match the thread name in the
 * sidebar.
 */
function openExploreFurtherToast(threadName: string): void {
  H.undoToastListContainer().within(() => {
    cy.findByText(`Added ${threadName}`, { timeout: 60000 }).should(
      "be.visible",
    );
    cy.findByRole("button", { name: "View" }).click();
  });
}
function measureGreeting(title: string | RegExp, promptInputTestId: string) {
  return cy.findByText(title).then(($title) =>
    cy.findByTestId(promptInputTestId).then(($input) => {
      const titleRect = $title[0].getBoundingClientRect();
      const inputRect = $input[0].getBoundingClientRect();
      return {
        titleTop: Math.round(titleRect.top),
        titleLeft: Math.round(titleRect.left),
        inputTop: Math.round(inputRect.top),
      };
    }),
  );
}

describe("scenarios > explorations", () => {
  beforeEach(() => {
    cy.task("stopMockLlmServer");
    H.restore();
    cy.signInAsAdmin();
    H.enableExplorations();
    seedMetrics();
    H.resetSnowplow();
    H.enableTracking();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  describe("entry page", () => {
    it("aligns the title and prompt input with the /question/ask page", () => {
      cy.visit("/question/ask");
      cy.findByTestId("metabot-conversation-history").should("be.visible");
      measureGreeting(
        /What (would you like to know|do you want to explore|are you looking to learn)\?/,
        "metabot-chat-input",
      ).then((askLayout) => {
        cy.visit("/question/research");
        measureGreeting(
          "What do you want to research?",
          "exploration-prompt-input",
        ).then((researchLayout) => {
          expect(researchLayout).to.deep.equal(askLayout);
        });
      });
    });
  });

  describe("new research", () => {
    it("picks Our analytics + metrics + timelines, creates an exploration, and lands on the detail page", () => {
      createTimelineWithSentinelEvent("Releases", "star").then((releasesId) => {
        createTimelineWithSentinelEvent("Marketing campaigns", "bell").then(
          (marketingId) => {
            H.visitNewExploration();

            // Root is a FE-only id (`"root"`); the create POST must send
            // `collection_id: null` or the BE schema rejects it.
            cy.findByRole("button", { name: /Personal collection/i }).click();
            H.pickEntity({ path: ["Our analytics"], select: true });
            cy.findByRole("button", { name: /Our analytics/i }).should(
              "be.visible",
            );

            H.startManualExploration();

            // Manual setup is its own location, so browser back returns here
            // instead of leaving the research flow (UXW-4832).
            cy.location("pathname").should("eq", "/question/research/plan");

            cy.log("Add a metric");
            cy.findByRole("button", { name: /Metrics/ }).click();
            H.selectAllMetricsTab();
            cy.findByRole("checkbox", { name: ORDERS_COUNT_METRIC_NAME }).check(
              {
                force: true,
              },
            );
            cy.findByRole("button", { name: "Add" }).click();

            cy.findByTestId("research-content")
              .should("be.visible")
              .and("contain", ORDERS_COUNT_METRIC_NAME);

            // Pick two timelines via the "+ Events" modal.
            H.addTimelinesToExploration(["Marketing campaigns", "Releases"]);

            H.beginResearch().then((id) => {
              // `beginResearch` consumed the create request; re-read it off its
              // alias to assert timeline ids + root collection were forwarded.
              cy.get("@createExploration")
                .its("request.body")
                .should((body) => {
                  expect(body.timeline_ids).to.deep.eq([
                    marketingId,
                    releasesId,
                  ]);
                  expect(body.collection_id).to.eq(null);
                });

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

              // `beginResearch` already asserted the detail-page URL.
              // No new-exploration CTA on the detail page.
              cy.findAllByRole("treeitem", { timeout: 15000 })
                .first()
                .should("be.visible");
              cy.findByRole("button", { name: /Start research/i }).should(
                "not.exist",
              );
            });
          },
        );
      });
    });
  });

  describe("detail page", () => {
    it("keeps the URL `timeline` param, its event chips, and the page's star and hidden state after a reload", () => {
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
            const temporalPage = () =>
              cy.findByRole("treeitem", {
                name: new RegExp(`${temporalDimension!.display_name}$`), // anchor at end so we don't match day of week or hour of day
              });

            cy.visit(`/question/research/${id}?timeline=${timelineId}`);
            // Sidebar treeitems appear once the BE returns query rows.
            cy.findAllByRole("treeitem", { timeout: 15000 })
              .first()
              .should("be.visible");

            temporalPage().click();
            cy.findByTestId("exploration-chart-grid").within(() => {
              H.timelineEventChip("Releases event").should("be.visible");
            });

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

            cy.log("Star and hide writes persist across a reload");
            cy.intercept("PUT", "/api/exploration/page/*/starred").as(
              "setStarred",
            );
            cy.intercept("PUT", "/api/exploration/pages/hidden").as(
              "setPagesHidden",
            );

            cy.get("body").type("s");
            cy.wait("@setStarred");
            cy.reload();
            H.main()
              .findByRole("button", { name: "Remove star", timeout: 15000 })
              .should("be.visible");

            cy.log("The page comment editor opens in a real browser");
            cy.get("body").type("c");
            H.popover()
              .findByRole("button", { name: "Send" })
              .should("be.visible");
            H.main().findByRole("button", { name: "Add comment" }).click();
            cy.findByRole("button", { name: "Send" }).should("not.exist");

            cy.get("body").type("h");
            cy.wait("@setPagesHidden");
            cy.reload();
            cy.findAllByRole("treeitem", { timeout: 15000 })
              .first()
              .should("be.visible");
            temporalPage().should("not.exist");
          });
        });
      });
    });
  });

  describe("chart click-through", () => {
    it("clicking a cartesian point posts explore-further filters and navigates to the new thread from its toast", () => {
      createTimelineWithSentinelEvent("Releases", "star").then((timelineId) => {
        cy.request("GET", "/api/exploration/dimensions").then(({ body }) => {
          // manual typecast for BE data
          const seeded = body as GetExplorationDataResponse;
          const seededMetric = seeded.metrics.find(
            (metric) => metric.name === ORDERS_COUNT_METRIC_NAME,
          );
          expect(
            seededMetric,
            `"${ORDERS_COUNT_METRIC_NAME}" metric is exposed by /api/exploration/dimensions`,
          ).to.exist;
          cy.request("POST", `/api/metric/${seededMetric!.id}/dimension/add`, {
            dimensions: [
              {
                id: "e2e00000-cafe-4bb8-9d8a-0123456789ab",
                mapping_target: [
                  "field",
                  { "source-field": ORDERS.PRODUCT_ID },
                  PRODUCTS.CATEGORY,
                ],
              },
            ],
          });
        });

        cy.request("GET", "/api/exploration/dimensions").then(({ body }) => {
          // Unjustified type cast. FIXME
          const data = body as GetExplorationDataResponse;
          const ordersMetric = data.metrics.find(
            (metric) => metric.name === ORDERS_COUNT_METRIC_NAME,
          );
          expect(
            ordersMetric,
            `"${ORDERS_COUNT_METRIC_NAME}" metric is exposed by /api/exploration/dimensions`,
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
            'orders metric exposes the curated "Category" dimension',
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
                // Navigate straight to the dimension's page. Driving the
                // sidebar here would depend on which group happens to be
                // auto-expanded — a state this test doesn't control.
                const pages = (exploration.threads ?? []).flatMap((thread) =>
                  (thread.blocks ?? []).flatMap((block) => block.pages ?? []),
                );
                const page = pages.find((p) =>
                  (p.name ?? "").includes(dimension!.display_name),
                );
                expect(page, "the dimension's page exists on the exploration")
                  .to.exist;
                cy.wrap(page!.id).as("pageId");
                cy.visit(
                  `/question/research/${explorationId}/page/${page!.id}?timeline=${timelineId}`,
                );
              },
            );

            cy.location("pathname").should("include", "/page/");

            // Wait for the selected page's queries to settle before clicking
            // the chart — `Ready` is the settled-state icon label.
            cy.findAllByLabelText("Ready", { timeout: 30000 })
              .first()
              .should("be.visible");

            H.chartPathWithFillColor("#509EE3").first().click({ force: true });

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
                "operator",
                "field_ref",
                "value",
                "display_value",
              );
              expect(request.body.explore_filters[0].operator).to.eq("=");

              // Unjustified type cast. FIXME
              const threads = (response?.body as Exploration).threads ?? [];
              const newThread = threads.find(
                (thread) => !initialThreadIds.includes(thread.id),
              );
              expect(newThread, "explore-further adds a new thread").to.exist;
              cy.wrap(newThread!.name).as("newThreadName");
            });

            cy.get<string>("@newThreadName").then((name) => {
              openExploreFurtherToast(name);
            });

            cy.get("@pageId").then((pageId) => {
              cy.location("pathname")
                .should("include", `/question/research/${explorationId}/page/`)
                .and(
                  "not.eq",
                  `/question/research/${explorationId}/page/${pageId}`,
                );
            });
            cy.findByRole("main")
              .findAllByTestId("visualization-root", { timeout: 15000 })
              .first()
              .should("be.visible");
          });
        });
      });
    });

    it("brushing a timeseries cartesian chart posts between explore_filters, navigates to the new thread from its toast, and Add to Summary flips the placeholder Summary, preserves filter pills, and mirrors page comments", () => {
      cy.request<GetExplorationDataResponse>(
        "GET",
        "/api/exploration/dimensions",
      ).then(({ body: data }) => {
        const ordersMetric = data.metrics.find(
          (metric) => metric.name === ORDERS_COUNT_METRIC_NAME,
        );
        expect(
          ordersMetric,
          `"${ORDERS_COUNT_METRIC_NAME}" metric is exposed by /api/exploration/dimensions`,
        ).to.exist;
        const dimsById = new Map(
          data.dimension_groups.flatMap((group) =>
            group.dimensions.map((dim) => [dim.id, dim] as const),
          ),
        );
        const temporalDimension = ordersMetric!.dimension_ids
          .map((id) => dimsById.get(id))
          .find((dim) => dim != null && dim.effective_type.includes("Date"));
        expect(
          temporalDimension,
          "orders metric exposes at least one temporal dimension",
        ).to.exist;

        H.createExplorationViaApi({
          name: "Chart brush explore-further fixture",
          metricCardIds: [ordersMetric!.id],
          dimensionIds: [temporalDimension!.id],
        }).then((explorationId) => {
          let initialThreadIds: number[] = [];

          cy.intercept(
            "POST",
            `/api/exploration/${explorationId}/explore-further`,
          ).as("exploreFurther");

          visitExplorationUntilSettled(explorationId, 1);

          cy.request<Exploration>(
            "GET",
            `/api/exploration/${explorationId}`,
          ).then(({ body: exploration }) => {
            expect(exploration.document, "BE auto-creates a Summary document")
              .to.exist;
            expect(exploration.document?.name).to.eq("Summary");
            expect(exploration.document?.is_placeholder).to.eq(true);
            initialThreadIds = (exploration.threads ?? []).map(
              (thread) => thread.id,
            );
          });

          cy.findByTestId("exploration-page-sidebar").within(() => {
            cy.findByRole("group", { name: ordersMetric!.name }).then(
              ($group) => {
                if ($group.attr("aria-expanded") !== "true") {
                  cy.wrap($group).click();
                }
              },
            );
            cy.findByRole("treeitem", {
              // Anchor on end so we don't match e.g. "Hour of day".
              name: new RegExp(`${temporalDimension!.display_name}$`),
            }).click();
          });

          H.ensureEchartsContainerHasSvg();

          cy.intercept(
            "POST",
            `/api/exploration/${explorationId}/summary/append`,
          ).as("appendSummary");

          cy.findByRole("button", { name: "Add to Summary" }).click();
          cy.wait("@appendSummary").then(({ response }) => {
            expect(response?.statusCode).to.eq(200);
            expect(response?.body?.is_placeholder).to.eq(false);
          });
          H.undoToastListContainer().within(() => {
            cy.findByText(/Added to/).should("be.visible");
            cy.findByLabelText("close icon").click();
            cy.findByText(/Added to/).should("not.exist");
          });

          H.ensureEchartsContainerHasSvg();
          H.applyBrush(120, 280);

          cy.findByTestId("click-actions-view")
            .findByRole("button", { name: /Explore further/i })
            .click();

          cy.wait("@exploreFurther").then(({ request, response }) => {
            expect(request.body.explore_filters)
              .to.be.an("array")
              .and.have.length(1);
            expect(request.body.explore_filters[0]).to.include.keys(
              "operator",
              "field_ref",
              "values",
              "display_value",
            );
            expect(request.body.explore_filters[0].operator).to.eq("between");
            expect(request.body.explore_filters[0].values)
              .to.be.an("array")
              .and.have.length(2);

            // Cypress does not type intercept response bodies.
            const threads = (response?.body as Exploration).threads ?? [];
            const newThread = threads.find(
              (thread) => !initialThreadIds.includes(thread.id),
            );
            expect(newThread, "explore-further adds a new thread").to.exist;
            cy.wrap(newThread!.name).as("newThreadName");
          });

          cy.location("pathname")
            .should("include", `/question/research/${explorationId}/page/`)
            .then((pathname) => {
              cy.wrap(pathname).as("pathnameBeforeView");
            });

          cy.get<string>("@newThreadName").then((name) => {
            openExploreFurtherToast(name);
          });

          cy.get<string>("@pathnameBeforeView").then((pathnameBeforeView) => {
            cy.location("pathname")
              .should("include", `/question/research/${explorationId}/page/`)
              .and("not.eq", pathnameBeforeView)
              .then((pathname) => {
                const pageId = Number(/\/page\/(\d+)/.exec(pathname)![1]);
                cy.wrap(pageId).as("pageId");
              });
          });

          // Temporal ranges use an en-dash (e.g. "Feb 2020 – Mar 2020"); exact
          // bounds depend on brush pixel coords, so just assert range formatting.
          cy.findByTestId("filter-pill")
            .should("be.visible")
            .invoke("text")
            .should("match", /–/)
            .as("exploreFilterPillText", { type: "static" });

          cy.findByRole("button", { name: "Add to Summary" }).click();
          cy.wait("@appendSummary")
            .its("response.statusCode")
            .should("eq", 200);

          H.undoToastListContainer().within(() => {
            cy.findByText(/Added to/).should("be.visible");
            cy.findByRole("button", { name: "View" }).click();
          });

          cy.location("pathname").should(
            "eq",
            `/question/research/${explorationId}/summary`,
          );
          cy.findAllByTestId("document-card-embed", { timeout: 15000 }).should(
            "have.length",
            2,
          );
          cy.findAllByTestId("document-card-embed")
            .eq(0)
            .within(() => {
              cy.findByTestId("visualization-root", { timeout: 15000 }).should(
                "be.visible",
              );
              cy.findByTestId("filter-pill").should("not.exist");
            });
          cy.findAllByTestId("document-card-embed")
            .eq(1)
            .should("be.visible")
            .findByTestId("filter-pill")
            .should("be.visible")
            .invoke("text")
            .then((text) => {
              cy.get("@exploreFilterPillText").should("eq", text);
            });

          // Seed a page comment via API
          cy.get<number>("@pageId").then((pageId) => {
            H.createComment({
              target_type: "exploration",
              target_id: explorationId,
              child_target_id: String(pageId),
              parent_comment_id: null,
              content: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Shared comment" }],
                  },
                ],
              },
            });
          });

          // Cold-load the Summary with the comments query param — the panel
          // must open without a prior click (the deep-link regression).
          cy.get<number>("@pageId").then((pageId) => {
            cy.visit(
              `/question/research/${explorationId}/summary?comments=${pageId}`,
            );
            cy.findByTestId("exploration-summary-comments", {
              timeout: 15000,
            })
              .should("be.visible")
              .and("contain.text", "Shared comment");
          });

          cy.get<number>("@pageId").then((pageId) => {
            cy.visit(
              `/question/research/${explorationId}/page/${pageId}?comments=${pageId}`,
            );
          });

          cy.findByTestId("exploration-comments", { timeout: 15000 }).should(
            "contain.text",
            "Shared comment",
          );
        });
      });
    });
  });

  describe("collection placement + archive", () => {
    it("places a newly-created exploration in the creator's personal collection, moves it to trash, and restores and permanently deletes archived explorations from the /trash page", () => {
      const explorationName = "Personal-collection archive fixture";
      const restoreName = "Trash-page restore fixture";
      const deleteName = "Trash-page delete-permanently fixture";

      H.createExplorationViaApi({ name: explorationName }).as("explorationId");
      cy.request("GET", "/api/user/current")
        .its("body.personal_collection_id")
        .should("be.a", "number")
        .as("personalCollectionId");

      cy.get<number>("@explorationId").then((explorationId) => {
        cy.get<number>("@personalCollectionId").then((personalCollectionId) => {
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
        });

        // Archiving an exploration goes through the centralized
        // `useSetArchive` hook → `PUT /api/exploration/:id
        // { archived: true }`.
        cy.intercept("PUT", `/api/exploration/${explorationId}`).as(
          "archiveExploration",
        );
      });
      cy.findByTestId("collection-table")
        .findByText(explorationName)
        .should("be.visible");

      // Open the row's overflow menu and click `Move to trash`.
      H.openCollectionItemMenu(explorationName);
      // The EntityItem dropdown renders each action as a
      // `<li aria-labelledby="...">`, not `role="menuitem"`,
      // so match the visible text — scoped to the open popover.
      H.popover().findByText("Move to trash").click();

      cy.wait("@archiveExploration").then(({ request, response }) => {
        expect(request.body).to.deep.eq({ archived: true });
        expect(response?.statusCode).to.eq(200);
      });

      // After archive, the collection shows its empty state and
      // the exploration row is gone from the page.
      cy.findByTestId("collection-empty-state")
        .findByText("This collection is empty")
        .should("be.visible");
      H.main().findByText(explorationName).should("not.exist");

      // BE state agrees: a subsequent GET reports
      // `archived: true`.
      cy.get<number>("@explorationId").then((explorationId) => {
        cy.request("GET", `/api/exploration/${explorationId}`).then(
          ({ body }) => {
            expect(body.archived, "exploration is archived").to.eq(true);
          },
        );
      });

      H.undoToast().findByText("Trashed research").should("exist");
      H.undo();

      cy.findByTestId("collection-table")
        .findByText(explorationName)
        .should("be.visible");

      H.createExplorationViaApi({ name: restoreName }).as("restoreId");
      H.createExplorationViaApi({ name: deleteName }).as("deleteId");
      for (const alias of ["@restoreId", "@deleteId"]) {
        cy.get<number>(alias).then((id) => {
          cy.request("PUT", `/api/exploration/${id}`, { archived: true });
        });
      }

      cy.log("Restore from the /trash page row menu");
      cy.visit("/trash");
      cy.findByTestId("collection-table")
        .findByText(restoreName)
        .should("be.visible");
      cy.findByTestId("collection-table")
        .findByText(deleteName)
        .should("be.visible");

      cy.get<number>("@restoreId").then((restoreId) => {
        cy.intercept("PUT", `/api/exploration/${restoreId}`).as("trashRestore");
      });
      H.openCollectionItemMenu(restoreName);
      H.popover().findByText("Restore").click();

      cy.wait("@trashRestore").then(({ request, response }) => {
        expect(request.body).to.deep.eq({ archived: false });
        expect(response?.statusCode).to.eq(200);
      });
      H.main().findByText(restoreName).should("not.exist");
      cy.get<number>("@restoreId").then((restoreId) => {
        cy.request("GET", `/api/exploration/${restoreId}`).then(({ body }) => {
          expect(body.archived, "exploration is no longer archived").to.eq(
            false,
          );
        });
      });

      cy.log("Delete permanently from the /trash page row menu");
      cy.findByTestId("collection-table")
        .findByText(deleteName)
        .should("be.visible");
      cy.get<number>("@deleteId").then((deleteId) => {
        cy.intercept("DELETE", `/api/exploration/${deleteId}`).as(
          "trashDelete",
        );
      });
      H.openCollectionItemMenu(deleteName);
      H.popover().findByText("Delete permanently").click();
      // The confirmation modal owns the final destructive button.
      H.modal()
        .findByRole("button", { name: /Delete permanently/i })
        .click();

      cy.wait("@trashDelete").its("response.statusCode").should("eq", 204);
      H.main().findByText(deleteName).should("not.exist");
      cy.get<number>("@deleteId").then((deleteId) => {
        cy.request({
          method: "GET",
          url: `/api/exploration/${deleteId}`,
          failOnStatusCode: false,
        })
          .its("status")
          .should("eq", 404);
      });
    });
  });
});
