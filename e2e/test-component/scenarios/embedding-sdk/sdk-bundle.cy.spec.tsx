import {
  InteractiveQuestion,
  MetabaseProvider,
  useMetabaseAuthStatus,
} from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import * as H from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  DEFAULT_SDK_AUTH_PROVIDER_CONFIG,
  getSdkBundleScriptElement,
} from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import { renameConflictingCljsGlobals } from "metabase/embedding-sdk/test/rename-conflicting-cljs-globals";

const { ORDERS_ID } = SAMPLE_DATABASE;

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
    afterEach(() => {
      getSdkBundleScriptElement()?.remove();
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
        cy.mount(
          <MetabaseProvider
            authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}
            loaderComponent={() => <div>Loading...</div>}
          >
            <InteractiveQuestion questionId={questionId} />
          </MetabaseProvider>,
        );
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
          getSdkBundleScriptElement()?.remove();
          (window as any).EMBEDDING_SDK_BUNDLE_LOADING_STATE = "loading";
          renameConflictingCljsGlobals();
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
          cy.mount(
            <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
              <InteractiveQuestion questionId={questionId} />
            </MetabaseProvider>,
          );
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
    it("should display an SDK question with custom layout components", () => {
      cy.window().then((win) => {
        cy.spy(win.console, "warn").as("consoleWarn");
      });

      cy.get<string>("@questionId").then((questionId) => {
        cy.mount(
          <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
            <InteractiveQuestion questionId={questionId}>
              <InteractiveQuestion.Title />

              <InteractiveQuestion.QuestionVisualization />
            </InteractiveQuestion>
          </MetabaseProvider>,
        );
      });

      getSdkRoot().within(() => {
        cy.findByText("Test Question").should("exist");

        cy.findByTestId("visualization-root").should("be.visible");
      });
    });

    it("it should show an error on a component level if SDK bundle is uninitialized", () => {
      (window as any).EMBEDDING_SDK_BUNDLE_LOADING_STATE = undefined;
      getSdkBundleScriptElement()?.remove();

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
    it("should call SDK hooks properly when called inside MetabaseProvider", () => {
      const Wrapper = () => {
        return useMetabaseAuthStatus()?.status ?? "SDK Bundle Loading...";
      };

      cy.get<string>("@questionId").then((questionId) => {
        cy.mount(
          <>
            <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
              <Wrapper />

              <InteractiveQuestion questionId={questionId} />
            </MetabaseProvider>
          </>,
        );
      });

      cy.get("body").within(() => {
        cy.findByText("loading").should("exist");
        cy.findByText("success").should("exist");
      });
    });

    it("should call SDK hooks properly when called outside of MetabaseProvider", () => {
      const Wrapper = () => {
        return useMetabaseAuthStatus()?.status ?? "SDK Bundle Loading...";
      };

      cy.get<string>("@questionId").then((questionId) => {
        cy.mount(
          <>
            <Wrapper />

            <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
              <InteractiveQuestion questionId={questionId} />
            </MetabaseProvider>
          </>,
        );
      });

      cy.get("body").within(() => {
        cy.findByText("loading").should("exist");
        cy.findByText("success").should("exist");
      });
    });
  });

  describe("Error handling", () => {
    beforeEach(() => {
      getSdkBundleScriptElement()?.remove();
    });

    afterEach(() => {
      getSdkBundleScriptElement()?.remove();
    });

    describe("when the SDK bundle can't be loaded", () => {
      it("should show an error", () => {
        cy.intercept("GET", "**/app/embedding-sdk.js", {
          statusCode: 404,
        });

        cy.mount(
          <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
            <InteractiveQuestion questionId={1} />
          </MetabaseProvider>,
        );

        cy.findByTestId("sdk-error-container").should(
          "contain.text",
          "Error loading the Embedding Analytics SDK",
        );
      });

      it("should show a custom error", () => {
        cy.intercept("GET", "**/app/embedding-sdk.js", {
          statusCode: 404,
        });

        cy.mount(
          <MetabaseProvider
            authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}
            errorComponent={({ message }: { message: string }) => (
              <div>Custom error: {message}</div>
            )}
          >
            <InteractiveQuestion questionId={1} />
          </MetabaseProvider>,
        );

        cy.findByTestId("sdk-error-container").should(
          "contain.text",
          "Custom error: Error loading the Embedding Analytics SDK",
        );
      });
    });

    describe("when the SDK bundle is incompatible with an instance", () => {
      it("should show an error with a close button", () => {
        cy.intercept("GET", "**/api/session/properties", {
          version: {
            tag: "v0.0.0", // incompatible version
          },
        });

        cy.mount(
          <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
            <InteractiveQuestion questionId={1} />
          </MetabaseProvider>,
        );

        cy.findByTestId("sdk-error-container").should(
          "contain.text",
          "Embedding SDK version incompatible with the Instance version",
        );

        cy.findByTestId("sdk-error-container").within(() => {
          cy.findByTestId("alert-close-button").click();

          cy.findByTestId("sdk-error-container").should("not.exist");
        });
      });

      it("should show a custom error with a close button", () => {
        cy.intercept("GET", "**/api/session/properties", {
          version: {
            tag: "v0.0.0", // incompatible version
          },
        });

        cy.mount(
          <MetabaseProvider
            authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}
            errorComponent={({
              message,
              onClose,
            }: {
              message: string;
              onClose: () => void;
            }) => (
              <div>
                <span>Custom error: {message}</span>
                <div data-testid="custom-alert-close-icon" onClick={onClose}>
                  x
                </div>
              </div>
            )}
          >
            <InteractiveQuestion questionId={1} />
          </MetabaseProvider>,
        );

        cy.findByTestId("sdk-error-container").should(
          "contain.text",
          "Embedding SDK version incompatible with the Instance version",
        );

        cy.findByTestId("sdk-error-container").within(() => {
          cy.findByTestId("custom-alert-close-icon").click();

          cy.findByTestId("sdk-error-container").should("not.exist");
        });
      });
    });
  });
});
