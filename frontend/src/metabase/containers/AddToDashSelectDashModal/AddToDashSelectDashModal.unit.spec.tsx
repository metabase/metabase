import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupMostRecentlyViewedDashboard,
  setupCollectionsEndpoints,
  setupCollectionByIdEndpoint,
  setupDashboardCollectionItemsEndpoint,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { getNextId } from "__support__/utils";
import { ROOT_COLLECTION as ROOT } from "metabase/entities/collections";
import { checkNotNull, isNotNull } from "metabase/lib/types";
import type {
  Card,
  Collection,
  Dashboard,
  SearchResult,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDashboard,
  createMockSearchResult,
  createMockUser,
} from "metabase-types/api/mocks";

import { ConnectedAddToDashSelectDashModal } from "./AddToDashSelectDashModal";

const CURRENT_USER = createMockUser({
  id: getNextId(),
  personal_collection_id: getNextId(),
  is_superuser: true,
});

const DASHBOARD = createMockDashboard({
  id: getNextId(),
  name: "Test dashboard",
  collection_id: 2,
  model: "dashboard",
});

const DASHBOARD_AT_ROOT = createMockDashboard({
  id: getNextId(),
  name: "Dashboard at root",
  collection_id: null,
  model: "dashboard",
});

const COLLECTION = createMockCollection({
  id: getNextId(),
  name: "Collection",
  can_write: true,
  is_personal: false,
  location: "/",
});

const SUBCOLLECTION = createMockCollection({
  id: getNextId(),
  name: "Nested collection",
  can_write: true,
  is_personal: false,
  location: `/${COLLECTION.id}/`,
});

const PERSONAL_COLLECTION = createMockCollection({
  id: CURRENT_USER.personal_collection_id,
  name: "My personal collection",
  personal_owner_id: CURRENT_USER.id,
  can_write: true,
  is_personal: true,
  location: "/",
});

const PERSONAL_SUBCOLLECTION = createMockCollection({
  id: getNextId(),
  name: "Nested personal collection",
  can_write: true,
  is_personal: true,
  location: `/${PERSONAL_COLLECTION.id}/`,
});

const ROOT_COLLECTION = createMockCollection({
  ...ROOT,
  can_write: true,
});

const COLLECTIONS = [
  ROOT_COLLECTION,
  COLLECTION,
  SUBCOLLECTION,
  PERSONAL_COLLECTION,
  PERSONAL_SUBCOLLECTION,
];

const CARD_IN_ROOT_COLLECTION = createMockCard({
  id: getNextId(),
  name: "Model Uno",
  dataset: true,
});

const CARD_IN_PUBLIC_COLLECTION = createMockCard({
  id: getNextId(),
  name: "Model Uno",
  dataset: true,
  collection: COLLECTION,
});

const CARD_IN_PERSONAL_COLLECTION = createMockCard({
  id: getNextId(),
  name: "Card in a personal collection",
  dataset: true,
  collection: PERSONAL_COLLECTION,
});

const DASHBOARD_RESULT_IN_PUBLIC_COLLECTION = createMockSearchResult({
  id: getNextId(),
  name: "dashboard in public collection",
  model: "dashboard",
  collection: COLLECTION,
});

const DASHBOARD_RESULT_IN_PERSONAL_COLLECTION = createMockSearchResult({
  id: getNextId(),
  name: "dashboard in personal collection",
  model: "dashboard",
  collection: PERSONAL_COLLECTION,
});

interface SetupOpts {
  card?: Card;
  collections?: Collection[];
  error?: string;
  dashboard?: Dashboard;
  mostRecentlyViewedDashboard?: Dashboard;
  waitForContent?: boolean;
  searchResults?: SearchResult[];
}

const setup = async ({
  card = CARD_IN_ROOT_COLLECTION,
  collections = COLLECTIONS,
  dashboard = DASHBOARD,
  mostRecentlyViewedDashboard = undefined,
  error,
  waitForContent = true,
  searchResults = [],
}: SetupOpts = {}) => {
  const dashboards = Array.from(
    new Set([dashboard, mostRecentlyViewedDashboard].filter(isNotNull)),
  );

  setupCollectionsEndpoints({ collections, rootCollection: ROOT_COLLECTION });
  setupDashboardCollectionItemsEndpoint(dashboards);
  setupCollectionByIdEndpoint({ collections, error });
  setupMostRecentlyViewedDashboard(mostRecentlyViewedDashboard);
  setupSearchEndpoints(searchResults);

  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <ConnectedAddToDashSelectDashModal
          card={card}
          onChangeLocation={() => undefined}
          onClose={() => undefined}
        />
      )}
    />,
    {
      withRouter: true,
      storeInitialState: {
        currentUser: CURRENT_USER,
      },
    },
  );

  if (waitForContent) {
    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });
  }
};

describe("AddToDashSelectDashModal", () => {
  describe("Create new Dashboard", () => {
    it("should open CreateDashboardModal", async () => {
      await setup({
        mostRecentlyViewedDashboard: DASHBOARD,
      });

      const createNewDashboard = screen.getByRole("heading", {
        name: "Create a new dashboard",
      });

      await userEvent.click(createNewDashboard);

      // opened CreateDashboardModal
      expect(
        screen.getByRole("heading", {
          name: /new dashboard/i,
        }),
      ).toBeInTheDocument();
    });
  });

  describe("Add to existing Dashboard", () => {
    it("should show loading", async () => {
      await setup({
        waitForContent: false,
        mostRecentlyViewedDashboard: DASHBOARD,
      });

      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    it("should show error", async () => {
      const ERROR = "Server Error!";
      await setup({ error: ERROR, mostRecentlyViewedDashboard: DASHBOARD });

      expect(screen.getByText(ERROR)).toBeInTheDocument();
    });

    describe("when user visited some dashboard in last 24hrs", () => {
      it("should preselected last visited dashboard in the picker", async () => {
        await setup({
          mostRecentlyViewedDashboard: DASHBOARD,
        });

        const dashboardCollection = checkNotNull(
          COLLECTIONS.find(
            collection => collection.id === DASHBOARD.collection_id,
          ),
        );

        // breadcrumbs
        assertBreadcrumbs([dashboardCollection]);
        expect(screen.getByText(DASHBOARD.name)).toBeInTheDocument();
      });

      describe("when last visited dashboard belongs to root", () => {
        it("should render root collection", async () => {
          await setup({
            dashboard: DASHBOARD_AT_ROOT,
            mostRecentlyViewedDashboard: DASHBOARD_AT_ROOT,
          });

          // breadcrumbs
          assertBreadcrumbs([ROOT_COLLECTION]);
          expect(screen.getByText(DASHBOARD_AT_ROOT.name)).toBeInTheDocument();
        });
      });

      describe("when last visited dashboard belongs to public subcollections", () => {
        const dashboardInPublicSubcollection = createMockDashboard({
          id: getNextId(),
          name: "Dashboard in public subcollection",
          collection: SUBCOLLECTION,
          collection_id: SUBCOLLECTION.id as number,
          model: "dashboard",
        });

        it("should show most recently visited dashboard if the question is in a public collection", async () => {
          await setup({
            mostRecentlyViewedDashboard: dashboardInPublicSubcollection,
          });

          // breadcrumbs
          assertBreadcrumbs([ROOT_COLLECTION, COLLECTION, SUBCOLLECTION]);

          // dashboard item
          expect(
            screen.getByText(dashboardInPublicSubcollection.name),
          ).toBeInTheDocument();
        });

        it("should show the root collection if the question is in a personal collection", async () => {
          await setup({
            card: CARD_IN_PERSONAL_COLLECTION,
            mostRecentlyViewedDashboard: dashboardInPublicSubcollection,
          });

          // breadcrumbs
          assertBreadcrumbs([ROOT_COLLECTION]);

          // Showing personal collection means we're viewing the root collection
          expect(
            screen.getByRole("heading", { name: PERSONAL_COLLECTION.name }),
          ).toBeInTheDocument();
        });
      });

      describe("when last visited dashboard belongs to personal subcollections", () => {
        const dashboardInPersonalSubcollection = createMockDashboard({
          id: getNextId(),
          name: "Dashboard in personal subcollection",
          collection: PERSONAL_SUBCOLLECTION,
          collection_id: PERSONAL_SUBCOLLECTION.id as number,
          model: "dashboard",
        });

        it("should show most recently visited dashboard if the question is in a public collection", async () => {
          await setup({
            mostRecentlyViewedDashboard: dashboardInPersonalSubcollection,
          });

          // breadcrumbs
          assertBreadcrumbs([
            ROOT_COLLECTION,
            PERSONAL_COLLECTION,
            PERSONAL_SUBCOLLECTION,
          ]);

          // dashboard item
          expect(
            await screen.findByText(dashboardInPersonalSubcollection.name),
          ).toBeInTheDocument();
        });

        it("should show most recently visited dashboard if the question is in a personal collection", async () => {
          await setup({
            card: CARD_IN_PERSONAL_COLLECTION,
            mostRecentlyViewedDashboard: dashboardInPersonalSubcollection,
          });

          // breadcrumbs
          assertBreadcrumbs([
            ROOT_COLLECTION,
            PERSONAL_COLLECTION,
            PERSONAL_SUBCOLLECTION,
          ]);

          // dashboard item
          expect(
            await screen.findByText(dashboardInPersonalSubcollection.name),
          ).toBeInTheDocument();
        });
      });
    });

    describe("when user didn't visit any dashboard during last 24hrs", () => {
      it("should render root collection without preselection", async () => {
        await setup();

        // breadcrumbs show root collection only
        expect(screen.getByTestId("item-picker-header")).toHaveTextContent(
          ROOT_COLLECTION.name,
        );
      });

      describe("question is in a public collection", () => {
        it("should render all collections", async () => {
          await setup({
            collections: COLLECTIONS,
          });
          expect(
            screen.getByRole("heading", {
              name: PERSONAL_COLLECTION.name,
            }),
          ).toBeInTheDocument();
          expect(
            screen.getByRole("heading", {
              name: COLLECTION.name,
            }),
          ).toBeInTheDocument();
        });

        describe('"Create a new dashboard" option', () => {
          beforeEach(async () => {
            await setup({
              collections: COLLECTIONS,
            });
          });

          it('should render "Create a new dashboard" option when opening the root collection (public collection)', async () => {
            expect(
              screen.getByRole("heading", {
                name: "Create a new dashboard",
              }),
            ).toBeInTheDocument();
          });

          it('should render "Create a new dashboard" option when opening public subcollections', async () => {
            await userEvent.click(
              screen.getByRole("heading", {
                name: COLLECTION.name,
              }),
            );

            expect(
              screen.getByRole("heading", {
                name: "Create a new dashboard",
              }),
            ).toBeInTheDocument();

            await userEvent.click(
              screen.getByRole("heading", {
                name: SUBCOLLECTION.name,
              }),
            );

            expect(
              screen.getByRole("heading", {
                name: "Create a new dashboard",
              }),
            ).toBeInTheDocument();
          });

          it('should render "Create a new dashboard" option when opening personal subcollections', async () => {
            await userEvent.click(
              screen.getByRole("heading", {
                name: PERSONAL_COLLECTION.name,
              }),
            );

            expect(
              screen.getByRole("heading", {
                name: "Create a new dashboard",
              }),
            ).toBeInTheDocument();

            await userEvent.click(
              screen.getByRole("heading", {
                name: PERSONAL_SUBCOLLECTION.name,
              }),
            );

            expect(
              screen.getByRole("heading", {
                name: "Create a new dashboard",
              }),
            ).toBeInTheDocument();
          });

          describe('when "Create a new dashboard" option is clicked', () => {
            beforeEach(async () => {
              // Open "Create a new dashboard" modal
              await userEvent.click(
                screen.getByRole("heading", {
                  name: "Create a new dashboard",
                }),
              );

              // Open "Create a new dashboard" modal
              await userEvent.click(screen.getByTestId("select-button"));
            });

            it("should render all collections", async () => {
              expect(
                await screen.findByRole("heading", {
                  name: "New dashboard",
                  hidden: true, // This is needed because the entity picker modal is also rendered, causing this heading to be inaccessible
                }),
              ).toBeInTheDocument();
              const popover = screen.getByRole("tooltip");
              expect(popover).toBeInTheDocument();
              expect(
                await within(popover).findByRole("heading", {
                  name: "Our analytics",
                }),
              ).toBeInTheDocument();
              expect(
                within(popover).getByRole("heading", {
                  name: COLLECTION.name,
                }),
              ).toBeInTheDocument();
              expect(
                within(popover).getByRole("heading", {
                  name: PERSONAL_COLLECTION.name,
                }),
              ).toBeInTheDocument();
            });

            it('should render "New collection" option', async () => {
              expect(
                await screen.findByRole("heading", {
                  name: /new dashboard/i,
                  hidden: true, // This is needed because the entity picker modal is also rendered, causing this heading to be inaccessible
                }),
              ).toBeInTheDocument();

              const popover = screen.getByRole("tooltip");
              expect(popover).toBeInTheDocument();

              expect(
                await within(popover).findByText("New collection"),
              ).toBeInTheDocument();
            });

            describe('when "New collection" option is clicked', () => {
              beforeEach(async () => {
                const popover = screen.getByRole("tooltip");

                await userEvent.click(
                  await within(popover).findByText("New collection"),
                );
              });

              it("should render all collections", async () => {
                expect(
                  screen.getByRole("heading", { name: "New collection" }),
                ).toBeInTheDocument();
                await userEvent.click(screen.getByTestId("select-button"));

                const popover = screen.getByRole("tooltip");
                expect(popover).toBeInTheDocument();
                expect(
                  await within(popover).findByRole("heading", {
                    name: "Our analytics",
                  }),
                ).toBeInTheDocument();
                expect(
                  within(popover).getByRole("heading", {
                    name: COLLECTION.name,
                  }),
                ).toBeInTheDocument();
                expect(
                  within(popover).getByRole("heading", {
                    name: PERSONAL_COLLECTION.name,
                  }),
                ).toBeInTheDocument();
              });
            });
          });
        });

        describe("whether we should render dashboards in a collection", () => {
          it("should render dashboards when opening the root collection (public collection)", async () => {
            // no `collection` and `collection_id` means it's in the root collection
            const dashboardInRootCollection = createMockDashboard({
              id: getNextId(),
              name: "Dashboard in root collection",
              model: "dashboard",
            });

            await setup({
              dashboard: dashboardInRootCollection,
            });

            expect(
              await screen.findByRole("heading", {
                name: dashboardInRootCollection.name,
              }),
            ).toBeInTheDocument();
          });

          it("should render dashboards when opening public subcollections", async () => {
            const dashboardInPublicSubcollection = createMockDashboard({
              id: getNextId(),
              name: "Dashboard in public subcollection",
              collection_id: COLLECTION.id as number,
              model: "dashboard",
            });

            await setup({
              dashboard: dashboardInPublicSubcollection,
            });

            await userEvent.click(
              screen.getByRole("heading", {
                name: COLLECTION.name,
              }),
            );

            expect(
              await screen.findByRole("heading", {
                name: dashboardInPublicSubcollection.name,
              }),
            ).toBeInTheDocument();
          });

          it("should render dashboards when opening personal collections", async () => {
            const dashboardInPersonalCollection = createMockDashboard({
              id: getNextId(),
              name: "Dashboard in personal collection",
              collection_id: PERSONAL_COLLECTION.id as number,
              model: "dashboard",
            });

            await setup({
              dashboard: dashboardInPersonalCollection,
            });

            await userEvent.click(
              screen.getByRole("heading", {
                name: PERSONAL_COLLECTION.name,
              }),
            );

            expect(
              await screen.findByRole("heading", {
                name: dashboardInPersonalCollection.name,
              }),
            ).toBeInTheDocument();
          });

          it("should render dashboards when opening personal subcollections", async () => {
            const dashboardInPersonalSubcollection = createMockDashboard({
              id: getNextId(),
              name: "Dashboard in personal subcollection",
              collection_id: PERSONAL_SUBCOLLECTION.id as number,
              model: "dashboard",
            });

            await setup({
              dashboard: dashboardInPersonalSubcollection,
            });

            await userEvent.click(
              screen.getByRole("heading", {
                name: PERSONAL_COLLECTION.name,
              }),
            );
            await userEvent.click(
              screen.getByRole("heading", {
                name: PERSONAL_SUBCOLLECTION.name,
              }),
            );

            expect(
              await screen.findByRole("heading", {
                name: dashboardInPersonalSubcollection.name,
              }),
            ).toBeInTheDocument();
          });
        });
      });

      describe("question is in a personal collection", () => {
        it("should not render public collections", async () => {
          await setup({
            card: CARD_IN_PERSONAL_COLLECTION,
            collections: COLLECTIONS,
          });

          expect(
            screen.getByRole("heading", {
              name: PERSONAL_COLLECTION.name,
            }),
          ).toBeInTheDocument();
          expect(
            screen.queryByRole("heading", {
              name: COLLECTION.name,
            }),
          ).not.toBeInTheDocument();
        });

        describe('"Create a new dashboard" option', () => {
          beforeEach(async () => {
            await setup({
              card: CARD_IN_PERSONAL_COLLECTION,
            });
          });

          it('should not render "Create a new dashboard" option when opening the root collection (public collection)', () => {
            expect(
              screen.queryByRole("heading", {
                name: "Create a new dashboard",
              }),
            ).not.toBeInTheDocument();
          });

          it('should render "Create a new dashboard" option when opening personal subcollections', async () => {
            await userEvent.click(
              screen.getByRole("heading", {
                name: PERSONAL_COLLECTION.name,
              }),
            );

            expect(
              screen.getByRole("heading", {
                name: "Create a new dashboard",
              }),
            ).toBeInTheDocument();

            await userEvent.click(
              screen.getByRole("heading", {
                name: PERSONAL_SUBCOLLECTION.name,
              }),
            );

            expect(
              screen.getByRole("heading", {
                name: "Create a new dashboard",
              }),
            ).toBeInTheDocument();
          });

          describe('when "Create a new dashboard" option is clicked when opening personal collections', () => {
            beforeEach(async () => {
              // "Create a new dashboard" option only renders when opening personal collections
              await userEvent.click(
                screen.getByRole("heading", {
                  name: PERSONAL_COLLECTION.name,
                }),
              );
              await userEvent.click(
                screen.getByRole("heading", {
                  name: "Create a new dashboard",
                }),
              );
            });

            it("should render only personal collections", async () => {
              expect(
                screen.getByRole("heading", { name: "New dashboard" }),
              ).toBeInTheDocument();
              await userEvent.click(screen.getByTestId("select-button"));

              const popover = screen.getByRole("tooltip");
              expect(popover).toBeInTheDocument();
              expect(
                await within(popover).findByRole("heading", {
                  name: PERSONAL_COLLECTION.name,
                }),
              ).toBeInTheDocument();
              expect(
                within(popover).queryByRole("heading", {
                  name: "Our analytics",
                }),
              ).not.toBeInTheDocument();
              expect(
                within(popover).queryByRole("heading", {
                  name: COLLECTION.name,
                }),
              ).not.toBeInTheDocument();
            });

            it('should not render "New collection" option when opening the root collection (public collection)', async () => {
              expect(
                screen.getByRole("heading", { name: "New dashboard" }),
              ).toBeInTheDocument();
              await userEvent.click(screen.getByTestId("select-button"));

              const popover = screen.getByRole("tooltip");
              expect(popover).toBeInTheDocument();
              expect(
                await within(popover).findByRole("heading", {
                  name: PERSONAL_COLLECTION.name,
                }),
              ).toBeInTheDocument();
              expect(
                within(popover).queryByText("New collection"),
              ).not.toBeInTheDocument();
            });

            describe('when "New collection" option is clicked when opening personal collections', () => {
              beforeEach(async () => {
                await userEvent.click(screen.getByTestId("select-button"));
                const popover = screen.getByRole("tooltip");

                // "New collection" option only renders when opening personal collections
                await userEvent.click(
                  await within(popover).findByTestId("expand-btn"),
                );
                await userEvent.click(
                  within(popover).getByText("New collection"),
                );
              });

              it("should render only personal collections", async () => {
                expect(
                  screen.getByRole("heading", { name: "New collection" }),
                ).toBeInTheDocument();
                await userEvent.click(screen.getByTestId("select-button"));

                const popover = screen.getByRole("tooltip");
                expect(popover).toBeInTheDocument();
                expect(
                  await within(popover).findByRole("heading", {
                    name: PERSONAL_COLLECTION.name,
                  }),
                ).toBeInTheDocument();
                expect(
                  within(popover).queryByRole("heading", {
                    name: "Our analytics",
                  }),
                ).not.toBeInTheDocument();
                expect(
                  within(popover).queryByRole("heading", {
                    name: COLLECTION.name,
                  }),
                ).not.toBeInTheDocument();
              });
            });
          });
        });

        describe("whether we should render dashboards in a collection", () => {
          it("should not render dashboards when opening the root collection (public collection)", async () => {
            const dashboardInPublicCollection = createMockDashboard({
              id: getNextId(),
              name: "Dashboard in public collection",
              // `null` means it's in the root collection
              collection_id: null,
              model: "dashboard",
            });

            await setup({
              card: CARD_IN_PERSONAL_COLLECTION,
              dashboard: dashboardInPublicCollection,
            });

            await waitFor(() => {
              expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
            });

            expect(
              screen.queryByRole("heading", {
                name: dashboardInPublicCollection.name,
              }),
            ).not.toBeInTheDocument();
          });

          it("should render dashboards when opening personal collections", async () => {
            const dashboardInPersonalCollection = createMockDashboard({
              id: getNextId(),
              name: "Dashboard in personal collection",
              collection_id: PERSONAL_COLLECTION.id as number,
              model: "dashboard",
            });

            await setup({
              card: CARD_IN_PERSONAL_COLLECTION,
              dashboard: dashboardInPersonalCollection,
            });

            await userEvent.click(
              screen.getByRole("heading", {
                name: PERSONAL_COLLECTION.name,
              }),
            );

            expect(
              await screen.findByRole("heading", {
                name: dashboardInPersonalCollection.name,
              }),
            ).toBeInTheDocument();
          });

          it("should render dashboards when opening personal subcollections", async () => {
            const dashboardInPersonalSubcollection = createMockDashboard({
              id: getNextId(),
              name: "Dashboard in personal subcollection",
              collection_id: PERSONAL_SUBCOLLECTION.id as number,
              model: "dashboard",
            });

            await setup({
              card: CARD_IN_PERSONAL_COLLECTION,
              dashboard: dashboardInPersonalSubcollection,
            });

            await userEvent.click(
              screen.getByRole("heading", {
                name: PERSONAL_COLLECTION.name,
              }),
            );

            await userEvent.click(
              screen.getByRole("heading", {
                name: PERSONAL_SUBCOLLECTION.name,
              }),
            );

            expect(
              await screen.findByRole("heading", {
                name: dashboardInPersonalSubcollection.name,
              }),
            ).toBeInTheDocument();
          });
        });
      });
    });

    describe("search dashboards", () => {
      describe("questions in the root collection (public collection)", () => {
        it("should search dashboards only in public collections", async () => {
          await setup({
            card: CARD_IN_ROOT_COLLECTION,
            searchResults: [DASHBOARD_RESULT_IN_PUBLIC_COLLECTION],
          });

          await userEvent.click(screen.getByRole("button", { name: "Search" }));
          const typedText = "dashboard";
          await userEvent.type(
            screen.getByPlaceholderText("Search"),
            `${typedText}{enter}`,
          );

          expect(
            await screen.findByText(DASHBOARD_RESULT_IN_PUBLIC_COLLECTION.name),
          ).toBeInTheDocument();

          const call = fetchMock.lastCall("path:/api/search");
          const urlObject = new URL(checkNotNull(call?.request?.url));
          expect(urlObject.pathname).toEqual("/api/search");
          expect(Object.fromEntries(urlObject.searchParams.entries())).toEqual({
            models: "dashboard",
            q: typedText,
          });
        });
      });

      describe("questions in public collections", () => {
        it("should search dashboards only in public collections", async () => {
          await setup({
            card: CARD_IN_PUBLIC_COLLECTION,
            searchResults: [DASHBOARD_RESULT_IN_PUBLIC_COLLECTION],
          });

          await userEvent.click(screen.getByRole("button", { name: "Search" }));
          const typedText = "dashboard";
          await userEvent.type(
            screen.getByPlaceholderText("Search"),
            `${typedText}{enter}`,
          );

          expect(
            await screen.findByText(DASHBOARD_RESULT_IN_PUBLIC_COLLECTION.name),
          ).toBeInTheDocument();

          const call = fetchMock.lastCall("path:/api/search");
          const urlObject = new URL(checkNotNull(call?.request?.url));
          expect(urlObject.pathname).toEqual("/api/search");
          expect(Object.fromEntries(urlObject.searchParams.entries())).toEqual({
            models: "dashboard",
            q: typedText,
          });
        });
      });

      describe("questions in personal collections", () => {
        it("should search all dashboards", async () => {
          await setup({
            card: CARD_IN_PERSONAL_COLLECTION,
            searchResults: [
              DASHBOARD_RESULT_IN_PUBLIC_COLLECTION,
              DASHBOARD_RESULT_IN_PERSONAL_COLLECTION,
            ],
          });

          await userEvent.click(screen.getByRole("button", { name: "Search" }));
          const typedText = "dashboard";
          await userEvent.type(
            screen.getByPlaceholderText("Search"),
            `${typedText}{enter}`,
          );

          expect(
            await screen.findByText(DASHBOARD_RESULT_IN_PUBLIC_COLLECTION.name),
          ).toBeInTheDocument();
          expect(
            screen.getByText(DASHBOARD_RESULT_IN_PERSONAL_COLLECTION.name),
          ).toBeInTheDocument();

          const call = fetchMock.lastCall("path:/api/search");
          const urlObject = new URL(checkNotNull(call?.request?.url));
          expect(urlObject.pathname).toEqual("/api/search");
          expect(Object.fromEntries(urlObject.searchParams.entries())).toEqual({
            models: "dashboard",
            q: typedText,
            filter_items_in_personal_collection: "only",
          });
        });
      });
    });
  });
});

function assertBreadcrumbs(collections: Collection[]) {
  collections.forEach(collection => {
    expect(screen.getByText(collection.name)).toBeInTheDocument();
  });
}
