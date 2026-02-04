import {
  InteractiveQuestion,
  MetabaseProvider,
} from "@metabase/embedding-sdk-react";

import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  getDefaultSdkAuthProviderConfig,
  getSdkBundleScriptElement,
  mountSdk,
  mountSdkContent,
} from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import { deleteConflictingCljsGlobals } from "metabase/embedding-sdk/test/delete-conflicting-cljs-globals";

const sdkBundleCleanup = () => {
  getSdkBundleScriptElement()?.remove();
  delete window.METABASE_EMBEDDING_SDK_BUNDLE;
  delete window.METABASE_PROVIDER_PROPS_STORE;
  deleteConflictingCljsGlobals();
};

describe(
  "scenarios > embedding-sdk > sdk-bundle",
  {
    tags: ["@skip-backward-compatibility"],
    // These test in some cases load a new SDK Bundle that in combination with the Component Testing is memory-consuming
    numTestsKeptInMemory: 1,
  },
  () => {
    beforeEach(() => {
      signInAsAdminAndEnableEmbeddingSdk();

      cy.signOut();

      mockAuthProviderAndJwtSignIn();
    });

    [{ strictMode: false }, { strictMode: true }].forEach(({ strictMode }) => {
      describe(`Common cases ${strictMode ? "with" : "without"} strict mode`, () => {
        it("should display an SDK question", () => {
          mountSdkContent(
            <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
            { strictMode },
          );

          getSdkRoot().within(() => {
            cy.findByText(
              /The loading state is `Loaded` but the SDK bundle is not loaded yet/,
            ).should("not.exist");

            cy.findByText("Orders").should("exist");

            cy.findByTestId("visualization-root").should("be.visible");
          });
        });

        it("should add and cleanup the MetabaseProviderPropsStore in a global object", () => {
          const metabaseProviderElement = (
            <MetabaseProvider
              authConfig={getDefaultSdkAuthProviderConfig()}
              locale="en"
            >
              <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
            </MetabaseProvider>
          );

          mountSdk(
            <>
              {metabaseProviderElement}
              {metabaseProviderElement}
            </>,
            { strictMode },
          );

          cy.mount(metabaseProviderElement);

          cy.window().its("METABASE_PROVIDER_PROPS_STORE").should("exist");

          // Unmount
          cy.mount(<></>);

          cy.window().its("METABASE_PROVIDER_PROPS_STORE").should("not.exist");

          cy.mount(metabaseProviderElement);

          cy.window().its("METABASE_PROVIDER_PROPS_STORE").should("exist");

          // Unmount
          cy.mount(<></>);

          cy.window().its("METABASE_PROVIDER_PROPS_STORE").should("not.exist");
        });

        it("should properly render global Mantine and Emotion styles once for multiple rendered components", () => {
          const checkStyles = ({
            expectedMantineStylesLength,
            expectedEmotionStylesLength,
          }: {
            expectedMantineStylesLength?: number;
            expectedEmotionStylesLength?: number;
          }) => {
            cy.get('[data-cy-root] > style[data-mantine-styles="true"]').should(
              "have.length",
              expectedMantineStylesLength,
            );
            cy.get(
              '[data-cy-root] > style[data-mantine-styles="classes"]',
            ).should("have.length", expectedMantineStylesLength);
            cy.get('style[data-emotion="emotion-global"]').should(
              "have.length",
              expectedEmotionStylesLength,
            );
          };

          const componentsCount = 10;

          mountSdk(
            <MetabaseProvider
              authConfig={getDefaultSdkAuthProviderConfig()}
              locale="en"
            >
              {Array.from({ length: componentsCount }, (_, i) => (
                <InteractiveQuestion
                  key={`q-${i}`}
                  questionId={ORDERS_QUESTION_ID}
                />
              ))}
            </MetabaseProvider>,
            { strictMode },
          );

          checkStyles({
            expectedMantineStylesLength: 1,
            // We have 3 usages of `<Global />` component from Emotion, all are wrapped within the EnsureSingleInstance
            expectedEmotionStylesLength: 3,
          });

          // Unmount
          mountSdk(<></>);

          checkStyles({
            expectedMantineStylesLength: 0,
            expectedEmotionStylesLength: 0,
          });
        });

        it("should update props passed to MetabaseProvider", () => {
          mountSdk(
            <MetabaseProvider
              authConfig={getDefaultSdkAuthProviderConfig()}
              locale="en"
            >
              <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
            </MetabaseProvider>,
            { strictMode },
          ).then(({ rerender }) => {
            getSdkRoot().within(() => {
              cy.findByText("Filter").should("exist");
            });

            // Update props via the declarative API
            rerender(
              <MetabaseProvider
                authConfig={getDefaultSdkAuthProviderConfig()}
                locale="es"
              >
                <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
              </MetabaseProvider>,
            );

            getSdkRoot().within(() => {
              cy.findByText("Filtro").should("exist");
            });

            // Update props via the imperative API (via window)
            cy.window().then((win) => {
              win.METABASE_PROVIDER_PROPS_STORE.setProps({
                authConfig: getDefaultSdkAuthProviderConfig(),
                locale: "fr",
              });

              getSdkRoot().within(() => {
                cy.findByText("Filtre").should("exist");
              });
            });
          });
        });

        it("should show a custom loader when the SDK bundle is loading", () => {
          sdkBundleCleanup();

          const MINUTE = 60 * 1000;
          cy.intercept("GET", "/api/card/*", (request) => {
            /**
             * Delay request for 10 min to avoid flakiness. We don't need the request to return, since we're testing the loading state.
             * From observing the failed test log, it failed at 10.9s, and the timeout for finding the loading indicator was set to 10s.
             * That means, Cypress started looking for the loading indicator after ~0.9s of the request being delayed.
             */
            request.continue(
              () => new Promise((resolve) => setTimeout(resolve, 10 * MINUTE)),
            );
          });

          mountSdkContent(
            <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
            {
              strictMode,
              sdkProviderProps: {
                loaderComponent: () => <div>Loading...</div>,
              },
              waitForUser: false,
            },
          );

          cy.findByTestId("loading-indicator").should(
            "have.text",
            "Loading...",
          );
        });

        [{ removeScriptTag: false }, { removeScriptTag: true }].forEach(
          ({ removeScriptTag }) => {
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

                mountSdk(
                  <>
                    <MetabaseProvider
                      authConfig={getDefaultSdkAuthProviderConfig()}
                    >
                      <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
                    </MetabaseProvider>
                    <MetabaseProvider
                      authConfig={getDefaultSdkAuthProviderConfig()}
                    >
                      <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
                    </MetabaseProvider>
                  </>,
                  { strictMode },
                );

                cy.get("@consoleWarn").should(
                  "be.calledWithMatch",
                  "Multiple instances of MetabaseProvider detected",
                );

                cy.findAllByTestId("loading-indicator").should(
                  "have.length",
                  2,
                );
              });

              it("should display an SDK question", () => {
                cy.window().then((win) => {
                  cy.spy(win.console, "warn").as("consoleWarn");
                });

                mountSdkContent(
                  <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
                  { strictMode },
                );

                getSdkRoot().within(() => {
                  cy.findByText("Orders").should("exist");
                });

                cy.get("@consoleWarn").should(
                  "not.be.calledWithMatch",
                  "Multiple instances of MetabaseProvider detected",
                );
              });
            });
          },
        );
      });
    });

    describe("Components", () => {
      it("should display an SDK question with custom layout components", () => {
        cy.window().then((win) => {
          cy.spy(win.console, "error").as("consoleError");
        });

        mountSdkContent(
          <>
            <InteractiveQuestion questionId={ORDERS_QUESTION_ID}>
              <InteractiveQuestion.Title />

              <InteractiveQuestion.QuestionVisualization />
            </InteractiveQuestion>
          </>,
        );

        getSdkRoot().within(() => {
          cy.findByText("Orders").should("exist");

          cy.findByTestId("visualization-root").should("be.visible");
        });

        cy.get("@consoleError").should("not.be.called");
      });

      it("should show an error on a component level if SDK components are not wrapped within the MetabaseProvider", () => {
        sdkBundleCleanup();

        cy.mount(<InteractiveQuestion questionId={ORDERS_QUESTION_ID} />);

        getSdkRoot().within(() => {
          cy.findByText(
            /Ensure all SDK components are wrapped in the Provider component./,
          ).should("exist");
        });
      });

      it("should show a console error if SDK Package component uses a prop that is not yet available in SDK bundle", () => {
        sdkBundleCleanup();

        cy.window().then((win) => {
          cy.spy(win.console, "error").as("consoleError");
        });

        mountSdkContent(
          <InteractiveQuestion
            questionId={ORDERS_QUESTION_ID}
            {...{ foo: "bar" }}
          />,
        );

        cy.get("@consoleError").should(
          "be.calledWithMatch",
          "this property is not recognized by the component",
        );
      });

      it("should show a console error if SDK Package component does not use a prop that is still expected by SDK bundle", () => {
        sdkBundleCleanup();

        cy.window().then((win) => {
          cy.spy(win.console, "error").as("consoleError");
        });

        mountSdkContent(<InteractiveQuestion />);

        cy.get("@consoleError").should(
          "be.calledWithMatch",
          "this property is required by the component",
        );
      });
    });
  },
);
