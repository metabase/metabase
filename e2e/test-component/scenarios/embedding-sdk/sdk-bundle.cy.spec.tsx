import {
  InteractiveQuestion,
  MetabaseProvider,
  useCreateDashboardApi,
  useMetabaseAuthStatus,
} from "@metabase/embedding-sdk-react";
import { type ReactNode, useEffect, useState } from "react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import * as H from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  DEFAULT_SDK_AUTH_PROVIDER_CONFIG,
  getSdkBundleScriptElement,
  mountSdkContent,
} from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import { renameConflictingCljsGlobals } from "metabase/embedding-sdk/test/rename-conflicting-cljs-globals";

const { ORDERS_ID } = SAMPLE_DATABASE;

const sdkBundleCleanup = () => {
  getSdkBundleScriptElement()?.remove();
  delete (window as any).MetabaseEmbeddingSDK;
  renameConflictingCljsGlobals();
};

describe("scenarios > embedding-sdk > sdk-bundle", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );

    signInAsAdminAndEnableEmbeddingSdk();

    H.createDashboardWithQuestions({
      questions: [
        {
          name: "Test Question",
          display: "table",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
          },
          visualization_settings: {
            "graph.dimensions": ["CREATED_AT", "STATE"],
            "graph.metrics": ["count", "sum"],
          },
        },
      ],
      cards: [{ col: 0, row: 0, size_x: 24, size_y: 6 }],
    }).then(({ dashboard, questions }) => {
      cy.wrap(dashboard.id).as("dashboardId");
      cy.wrap(questions[0].id).as("questionId");
    });

    cy.signOut();

    mockAuthProviderAndJwtSignIn();
  });

  describe("Common cases", () => {
    beforeEach(() => {
      sdkBundleCleanup();
    });

    it("should update props passed to MetabaseProvider", () => {
      cy.get<string>("@questionId").then((questionId) => {
        cy.mount(
          <MetabaseProvider
            authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}
            locale="en"
          >
            <InteractiveQuestion questionId={questionId} />
          </MetabaseProvider>,
        ).then(({ rerender }) => {
          getSdkRoot().within(() => {
            cy.findByText("Filter").should("exist");
          });

          // Update props via the declarative API
          rerender(
            <MetabaseProvider
              authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}
              locale="es"
            >
              <InteractiveQuestion questionId={questionId} />
            </MetabaseProvider>,
          );

          getSdkRoot().within(() => {
            cy.findByText("Filtro").should("exist");
          });

          // Update props via the imperative API (via window)
          cy.window().then((win) => {
            (win as any).METABASE_PROVIDER_PROPS_STORE.setProps({
              authConfig: DEFAULT_SDK_AUTH_PROVIDER_CONFIG,
              locale: "fr",
            });

            getSdkRoot().within(() => {
              cy.findByText("Filtre").should("exist");
            });
          });
        });
      });
    });

    it("should show a custom loader when the SDK bundle is loading", () => {
      cy.get<string>("@questionId").then((questionId) => {
        mountSdkContent(<InteractiveQuestion questionId={questionId} />, {
          sdkProviderProps: {
            loaderComponent: () => <div>Loading...</div>,
          },
          waitForUser: false,
        });
      });

      cy.findByTestId("loading-indicator").should("have.text", "Loading...");
    });
  });

  [
    {
      removeScriptTag: false,
    },
    {
      removeScriptTag: true,
    },
  ].forEach(({ removeScriptTag }) => {
    describe(`${removeScriptTag ? "With" : "Without"} the script tag removal between tests`, () => {
      beforeEach(() => {
        if (removeScriptTag) {
          sdkBundleCleanup();
        }
      });

      it("should log a warning message if multiple MetabaseProvider components are used", () => {
        cy.window().then((win) => {
          cy.spy(win.console, "warn").as("consoleWarn");
        });

        cy.get<string>("@questionId").then((questionId) => {
          cy.mount(
            <>
              <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
                <InteractiveQuestion questionId={questionId} />
              </MetabaseProvider>
              <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
                <InteractiveQuestion questionId={questionId} />
              </MetabaseProvider>
            </>,
          );
        });

        cy.get("@consoleWarn").should(
          "be.calledWithMatch",
          "Multiple instances of MetabaseProvider detected",
        );

        cy.findAllByTestId("loading-indicator").should("have.length", 2);
      });

      it("should display an SDK question", () => {
        cy.window().then((win) => {
          cy.spy(win.console, "warn").as("consoleWarn");
        });

        cy.get<string>("@questionId").then((questionId) => {
          mountSdkContent(<InteractiveQuestion questionId={questionId} />);
        });

        getSdkRoot().within(() => {
          cy.findByText("Test Question").should("exist");
        });

        cy.get("@consoleWarn").should(
          "not.be.calledWithMatch",
          "Multiple instances of MetabaseProvider detected",
        );
      });
    });
  });

  describe("Components", () => {
    it("should display an SDK question in StrictMode", () => {
      sdkBundleCleanup();

      cy.window().then((win) => {
        cy.spy(win.console, "warn").as("consoleWarn");
      });

      cy.get<string>("@questionId").then((questionId) => {
        mountSdkContent(<InteractiveQuestion questionId={questionId} />, {
          strictMode: true,
        });
      });

      getSdkRoot().within(() => {
        cy.findByText(
          /The loading state is `Loaded` but the SDK bundle is not loaded yet/,
        ).should("not.exist");

        cy.findByText("Test Question").should("exist");

        cy.findByTestId("visualization-root").should("be.visible");
      });
    });

    it("should display an SDK question with custom layout components", () => {
      cy.window().then((win) => {
        cy.spy(win.console, "warn").as("consoleWarn");
      });

      cy.get<string>("@questionId").then((questionId) => {
        mountSdkContent(
          <>
            <InteractiveQuestion questionId={questionId}>
              <InteractiveQuestion.Title />

              <InteractiveQuestion.QuestionVisualization />
            </InteractiveQuestion>
          </>,
        );
      });

      getSdkRoot().within(() => {
        cy.findByText("Test Question").should("exist");

        cy.findByTestId("visualization-root").should("be.visible");
      });
    });

    it("it should show an error on a component level if SDK bundle is not loaded", () => {
      sdkBundleCleanup();

      cy.window().then((win) => {
        cy.spy(win.console, "warn").as("consoleWarn");
      });

      cy.get<string>("@questionId").then((questionId) => {
        cy.mount(<InteractiveQuestion questionId={questionId} />);
      });

      getSdkRoot().within(() => {
        cy.findByText(
          /Ensure all SDK components are wrapped in the Provider component./,
        ).should("exist");
      });
    });
  });

  describe("Hooks", () => {
    type HookScenario = {
      name: string;
      waitForComponent: boolean;
      mount: (Wrapper: () => ReactNode, questionId?: string) => JSX.Element;
    };

    const scenarios: HookScenario[] = [
      {
        name: "inside MetabaseProvider",
        waitForComponent: true,
        mount: (Wrapper, questionId) => (
          <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
            <Wrapper />
            {questionId && <InteractiveQuestion questionId={questionId} />}
          </MetabaseProvider>
        ),
      },
      {
        name: "outside of MetabaseProvider",
        waitForComponent: true,
        mount: (Wrapper, questionId) => (
          <>
            <Wrapper />
            <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
              {questionId && <InteractiveQuestion questionId={questionId} />}
            </MetabaseProvider>
          </>
        ),
      },
      {
        name: "without rendered SDK components",
        waitForComponent: false,
        mount: (Wrapper) => (
          <>
            <Wrapper />
            <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG} />
          </>
        ),
      },
    ];

    describe("useMetabaseAuthStatus", () => {
      const Wrapper = () => {
        return useMetabaseAuthStatus()?.status ?? "SDK Bundle Loading...";
      };

      Cypress._.each(
        scenarios,
        ({ name, waitForComponent, mount }: HookScenario) => {
          it(`should call hook properly when called ${name}`, () => {
            if (waitForComponent) {
              cy.get<string>("@questionId").then((questionId) => {
                cy.mount(mount(Wrapper, questionId));
              });
            } else {
              cy.mount(mount(Wrapper));
            }

            cy.get("body").within(() => {
              cy.findByText("loading").should("exist");
              cy.findByText("success").should("exist");
            });
          });
        },
      );
    });

    describe("useCreateDashboardApi", () => {
      const Wrapper = () => {
        const result = useCreateDashboardApi();
        const [createdDashboard, setCreatedDashboard] = useState<{
          name: string;
        } | null>(null);

        useEffect(() => {
          if (result) {
            result
              .createDashboard({
                name: "Test Dashboard",
                description: "This is a test dashboard",
              })
              .then((dashboard) => {
                setCreatedDashboard(dashboard);
              });
          }
        }, [result]);

        return createdDashboard?.name;
      };

      Cypress._.each(
        scenarios,
        ({ name, waitForComponent, mount }: HookScenario) => {
          it(`should call hook properly when called ${name}`, () => {
            if (waitForComponent) {
              cy.get<string>("@questionId").then((questionId) => {
                cy.mount(mount(Wrapper, questionId));
              });
            } else {
              cy.mount(mount(Wrapper));
            }

            cy.get("body").within(() => {
              cy.findByText("Test Dashboard").should("exist");
            });
          });
        },
      );
    });
  });

  describe("Error handling", () => {
    beforeEach(() => {
      sdkBundleCleanup();
    });

    afterEach(() => {
      sdkBundleCleanup();
    });

    describe("when the SDK bundle can't be loaded", () => {
      it("should show an error", () => {
        cy.intercept("GET", "**/app/embedding-sdk.js", {
          statusCode: 404,
        });

        mountSdkContent(<InteractiveQuestion questionId={1} />, {
          waitForUser: false,
        });

        cy.findByTestId("sdk-error-container").should(
          "contain.text",
          "Error loading the Embedding Analytics SDK",
        );
      });

      it("should show a custom error", () => {
        cy.intercept("GET", "**/app/embedding-sdk.js", {
          statusCode: 404,
        });

        mountSdkContent(<InteractiveQuestion questionId={1} />, {
          sdkProviderProps: {
            errorComponent: ({ message }) => <div>Custom error: {message}</div>,
          },
          waitForUser: false,
        });

        cy.findByTestId("sdk-error-container").should(
          "contain.text",
          "Custom error: Error loading the Embedding Analytics SDK",
        );
      });
    });
  });
});
