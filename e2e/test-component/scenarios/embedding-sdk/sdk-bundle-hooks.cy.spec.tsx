import {
  InteractiveQuestion,
  type MetabaseDashboard,
  MetabaseProvider,
  useAction,
  useApplicationName,
  useAvailableFonts,
  useCreateDashboardApi,
  useCurrentUser,
  useMetabaseAuthStatus,
} from "@metabase/embedding-sdk-react";
import { useEffect, useState } from "react";

import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  DEFAULT_SDK_AUTH_PROVIDER_CONFIG,
  mountSdk,
} from "e2e/support/helpers/embedding-sdk-component-testing";
import {
  mockAuthProviderAndJwtSignIn,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/embedding-sdk-testing";

describe("scenarios > embedding-sdk > sdk-bundle public hooks", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );

    signInAsAdminAndEnableEmbeddingSdk();

    cy.signOut();

    mockAuthProviderAndJwtSignIn();
  });

  describe("useMetabaseAuthStatus", () => {
    const ComponentWithHook = () => {
      return useMetabaseAuthStatus()?.status ?? "SDK Bundle Loading...";
    };

    it("should return the auth status when the hook is called inside MetabaseProvider", () => {
      mountSdk(
        <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
          <ComponentWithHook />

          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>,
      );

      cy.get("body").within(() => {
        cy.findByText("loading").should("exist");
        cy.findByText("success").should("exist");
      });
    });

    it("should return the auth status when the hook is called outside of MetabaseProvider", () => {
      mountSdk(
        <>
          <ComponentWithHook />

          <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
            <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
          </MetabaseProvider>
        </>,
      );

      cy.get("body").within(() => {
        cy.findByText("loading").should("exist");
        cy.findByText("success").should("exist");
      });
    });

    it("should return the auth status when the hook is called without rendered SDK components", () => {
      mountSdk(
        <>
          <ComponentWithHook />

          <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG} />
        </>,
      );

      cy.get("body").within(() => {
        cy.findByText("loading").should("exist");
        cy.findByText("success").should("exist");
      });
    });
  });

  describe("useCreateDashboardApi", () => {
    const ComponentWithHook = () => {
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
            .then((dashboard: MetabaseDashboard) => {
              setCreatedDashboard(dashboard);
            });
        }
      }, [result]);

      return createdDashboard?.name;
    };

    it("should render the created dashboard name when called inside MetabaseProvider", () => {
      mountSdk(
        <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
          <ComponentWithHook />

          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>,
      );

      cy.get("body").within(() => {
        cy.findByText("Test Dashboard").should("exist");
      });
    });

    it("should render the created dashboard name when called outside of MetabaseProvider", () => {
      mountSdk(
        <>
          <ComponentWithHook />

          <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
            <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
          </MetabaseProvider>
        </>,
      );

      cy.get("body").within(() => {
        cy.findByText("Test Dashboard").should("exist");
      });
    });

    it("should render the created dashboard name when called without rendered SDK components", () => {
      mountSdk(
        <>
          <ComponentWithHook />

          <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG} />
        </>,
      );

      cy.get("body").within(() => {
        cy.findByText("Test Dashboard").should("exist");
      });
    });
  });

  describe("useApplicationName", () => {
    const ComponentWithHook = () => {
      const appName = useApplicationName();

      return <div data-testid="app-name">{appName ?? "Loading..."}</div>;
    };

    it("should render the application name when called inside MetabaseProvider", () => {
      mountSdk(
        <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
          <ComponentWithHook />

          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>,
      );

      cy.findByTestId("app-name").should("have.text", "Metabase");
    });

    it("should render the application name when called outside MetabaseProvider", () => {
      mountSdk(
        <>
          <ComponentWithHook />

          <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
            <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
          </MetabaseProvider>
        </>,
      );

      cy.findByTestId("app-name").should("have.text", "Metabase");
    });

    it("should render the application name when called without rendered SDK components", () => {
      mountSdk(
        <>
          <ComponentWithHook />

          <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG} />
        </>,
      );

      cy.findByTestId("app-name").should("have.text", "Metabase");
    });
  });

  describe("useAvailableFonts", () => {
    const ComponentWithHook = () => {
      const fonts = useAvailableFonts();

      return (
        <div data-testid="fonts-list">
          {fonts?.availableFonts?.join(", ") ?? "Loading..."}
        </div>
      );
    };

    it("should render available fonts when called inside MetabaseProvider", () => {
      mountSdk(
        <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
          <ComponentWithHook />

          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>,
      );

      cy.findByTestId("fonts-list").should("contain.text", "Lato");
    });

    it("should render available fonts when called outside MetabaseProvider", () => {
      mountSdk(
        <>
          <ComponentWithHook />

          <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
            <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
          </MetabaseProvider>
        </>,
      );

      cy.findByTestId("fonts-list").should("contain.text", "Lato");
    });

    it("should render available fonts when called without rendered SDK components", () => {
      mountSdk(
        <>
          <ComponentWithHook />

          <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG} />
        </>,
      );

      cy.findByTestId("fonts-list").should("contain.text", "Lato");
    });
  });

  describe("useAction", () => {
    const STUB_ACTION_ID = 12345;

    const ComponentWithHook = () => {
      const { execute, result, error, isExecuting } = useAction<{
        amount: number;
      }>(STUB_ACTION_ID);

      useEffect(() => {
        execute({ amount: 1 }).catch(() => {
          // error is captured into hook state; ignore the rethrow
        });
      }, [execute]);

      return (
        <>
          <div data-testid="action-result">
            {result
              ? JSON.stringify(result)
              : isExecuting
                ? "executing"
                : "idle"}
          </div>
          <div data-testid="action-error">
            {error ? (error.data.message ?? "") : ""}
          </div>
        </>
      );
    };

    beforeEach(() => {
      cy.intercept("POST", `/api/action/${STUB_ACTION_ID}/execute`, {
        statusCode: 200,
        body: { "rows-affected": 7 },
      }).as("executeAction");
    });

    it("should execute the action when called inside MetabaseProvider", () => {
      mountSdk(
        <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
          <ComponentWithHook />

          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>,
      );

      cy.wait("@executeAction")
        .its("request.body")
        .should("deep.equal", { parameters: { amount: 1 } });

      cy.findByTestId("action-result").should(
        "contain.text",
        '"rows-affected":7',
      );
    });

    it("should execute the action when called outside MetabaseProvider", () => {
      mountSdk(
        <>
          <ComponentWithHook />

          <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
            <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
          </MetabaseProvider>
        </>,
      );

      cy.wait("@executeAction");

      cy.findByTestId("action-result").should(
        "contain.text",
        '"rows-affected":7',
      );
    });

    it("should execute the action when called without rendered SDK components", () => {
      mountSdk(
        <>
          <ComponentWithHook />

          <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG} />
        </>,
      );

      cy.wait("@executeAction");

      cy.findByTestId("action-result").should(
        "contain.text",
        '"rows-affected":7',
      );
    });

    it("should surface a permission-denied error from the execute endpoint", () => {
      // Override the beforeEach intercept — the last-registered Cypress
      // intercept for a matching route wins.
      cy.intercept("POST", `/api/action/${STUB_ACTION_ID}/execute`, {
        statusCode: 403,
        body: { message: "You don't have permissions to do that." },
      }).as("executeActionForbidden");

      mountSdk(
        <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
          <ComponentWithHook />

          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>,
      );

      cy.wait("@executeActionForbidden")
        .its("response.statusCode")
        .should("eq", 403);

      cy.findByTestId("action-error").should(
        "contain.text",
        "You don't have permissions to do that.",
      );

      // result stays idle because execute threw before setResult.
      cy.findByTestId("action-result").should("have.text", "idle");
    });

    it("should surface a basic-action create response shape verbatim", () => {
      // Override the beforeEach intercept with the `create` kind's response
      // shape. The hook is kind-agnostic at runtime (no per-kind branching) —
      // covering one basic-action shape is enough to lock the JSON-body
      // pass-through contract; update/delete/bulk would exercise the same
      // code path.
      cy.intercept("POST", `/api/action/${STUB_ACTION_ID}/execute`, {
        statusCode: 200,
        body: { "created-row": { id: 99, amount: 1 } },
      }).as("executeActionCreate");

      mountSdk(
        <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
          <ComponentWithHook />

          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>,
      );

      cy.wait("@executeActionCreate");

      cy.findByTestId("action-result").should(
        "contain.text",
        '"created-row":{"id":99,"amount":1}',
      );
    });

    it("should clear result and error when reset() is called", () => {
      const ComponentWithResetButton = () => {
        const { execute, result, error, isExecuting, reset } = useAction<{
          amount: number;
        }>(STUB_ACTION_ID);

        useEffect(() => {
          execute({ amount: 1 }).catch(() => {
            // error is captured into hook state; ignore the rethrow
          });
        }, [execute]);

        return (
          <>
            <div data-testid="action-result">
              {result
                ? JSON.stringify(result)
                : isExecuting
                  ? "executing"
                  : "idle"}
            </div>
            <div data-testid="action-error">
              {error
                ? ((error as { data?: { message?: string } }).data?.message ??
                  String(error))
                : ""}
            </div>
            <button data-testid="action-reset" onClick={() => reset()}>
              reset
            </button>
          </>
        );
      };

      mountSdk(
        <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
          <ComponentWithResetButton />

          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>,
      );

      cy.wait("@executeAction");
      cy.findByTestId("action-result").should(
        "contain.text",
        '"rows-affected":7',
      );

      cy.findByTestId("action-reset").click();

      cy.findByTestId("action-result").should("have.text", "idle");
      cy.findByTestId("action-error").should("have.text", "");
    });
  });

  describe("useCurrentUser", () => {
    const ComponentWithHook = () => {
      const user = useCurrentUser();

      return (
        <div data-testid="current-user">{user ? user.email : "Loading..."}</div>
      );
    };

    it("should render the current user email when called inside MetabaseProvider", () => {
      mountSdk(
        <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
          <ComponentWithHook />

          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>,
      );

      cy.findByTestId("current-user").should(
        "have.text",
        "admin@metabase.test",
      );
    });

    it("should render the current user email when called outside MetabaseProvider", () => {
      mountSdk(
        <>
          <ComponentWithHook />

          <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
            <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
          </MetabaseProvider>
        </>,
      );

      cy.findByTestId("current-user").should(
        "have.text",
        "admin@metabase.test",
      );
    });

    it("should render the current user email when called without rendered SDK components", () => {
      mountSdk(
        <>
          <ComponentWithHook />

          <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG} />
        </>,
      );

      cy.findByTestId("current-user").should(
        "have.text",
        "admin@metabase.test",
      );
    });
  });
});
