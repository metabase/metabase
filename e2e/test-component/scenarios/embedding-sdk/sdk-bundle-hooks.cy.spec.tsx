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

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  createImplicitAction,
  createQuestion,
  setActionsEnabledForDB,
} from "e2e/support/helpers";
import {
  DEFAULT_SDK_AUTH_PROVIDER_CONFIG,
  mountSdk,
} from "e2e/support/helpers/embedding-sdk-component-testing";
import {
  mockAuthProviderAndJwtSignIn,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/embedding-sdk-testing";
import type { SdkActionId } from "embedding-sdk-bundle/types/action";

const { ORDERS_ID } = SAMPLE_DATABASE;

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
    // Pre-create a real model + implicit action in the app DB so each test
    // has a real numeric id to hand to the hook — not a made-up stub id
    // that never round-trips through the backend. The outer `beforeEach`
    // signed us out and switched to JWT-mocked auth for the SDK; we re-sign
    // in as admin to bootstrap resources, then restore the JWT-mocked state.
    beforeEach(() => {
      cy.signInAsAdmin();
      setActionsEnabledForDB(SAMPLE_DB_ID, true);
      createQuestion({
        name: "useAction test model",
        type: "model",
        // Root collection so the JWT-authed SDK user (not admin) can see
        // the model and the action's read-check passes during execute.
        collection_id: null,
        query: { "source-table": ORDERS_ID },
      }).then(({ body: model }) => {
        createImplicitAction({
          kind: "update",
          model_id: model.id,
        }).then(() => {
          // Re-fetch the action list scoped to the model we just created
          // rather than trusting the create response, which was flaky on CI:
          // the create path goes through `t2/insert-returning-instances!`
          // (see `actions/models.clj`) and intermittently yielded an id that
          // 404'd from `eid-translation/->id-or-404` at execute time. Scoping
          // the GET by `model-id` is unambiguous because we created exactly
          // one action for this model.
          cy.request("GET", `/api/action?model-id=${model.id}`).then(
            ({ body: actions }) => {
              const action = actions[0];
              cy.wrap(action.id).as("actionId");
            },
          );
        });
      });
      cy.signOut();
      mockAuthProviderAndJwtSignIn();
    });

    // Parameters match the Orders model: `id` is the PK that the
    // `row/update` implicit action expects, plus one updatable column.
    const ACTION_PARAMS = { id: 1, quantity: 99 } as const;

    const ComponentWithHook = ({
      actionId,
    }: {
      actionId: SdkActionId | null;
    }) => {
      // Wait for the SDK's auth flow to complete before firing the action —
      // otherwise the action POST goes out without credentials and
      // the backend rejects with a 401.
      const authStatus = useMetabaseAuthStatus();
      const { execute, result, error, isExecuting } = useAction<{
        id: number;
        quantity: number;
      }>(actionId);

      useEffect(() => {
        if (authStatus?.status !== "success") {
          return;
        }
        execute(ACTION_PARAMS).catch(() => {
          // error is captured into hook state; ignore the rethrow
        });
      }, [execute, authStatus?.status]);

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

    it("should execute the action when called inside MetabaseProvider", () => {
      cy.get<number>("@actionId").then((actionId) => {
        // Observe-only intercept (no reply) — the BE actually runs the
        // implicit `row/update` against Orders and returns its real shape.
        cy.intercept("POST", `/api/action/${actionId}/execute`).as(
          "executeAction",
        );

        mountSdk(
          <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
            <ComponentWithHook actionId={actionId} />

            <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
          </MetabaseProvider>,
        );

        cy.wait("@executeAction").then(({ request, response }) => {
          expect(request.body).to.deep.equal({ parameters: ACTION_PARAMS });
          expect(response?.statusCode).to.eq(200);
        });

        // `row/update` returns the affected primary keys under `rows-updated`.
        cy.findByTestId("action-result").should(
          "contain.text",
          '"rows-updated":',
        );
      });
    });

    it("should execute the action when called outside MetabaseProvider", () => {
      cy.get<number>("@actionId").then((actionId) => {
        cy.intercept("POST", `/api/action/${actionId}/execute`).as(
          "executeAction",
        );

        mountSdk(
          <>
            <ComponentWithHook actionId={actionId} />

            <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
              <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
            </MetabaseProvider>
          </>,
        );

        cy.wait("@executeAction").its("response.statusCode").should("eq", 200);

        cy.findByTestId("action-result").should(
          "contain.text",
          '"rows-updated":',
        );
      });
    });

    it("should surface a permission-denied error from the execute endpoint", () => {
      // This is the one test where we stub the response: the focus is on
      // how the hook surfaces a non-2xx body via `error.data.message`,
      // and creating a real auth scenario where the admin user lacks
      // permission to execute their own action would require setting up a
      // separate role + sandbox, which is out of scope for this hook test.
      cy.get<number>("@actionId").then((actionId) => {
        cy.intercept("POST", `/api/action/${actionId}/execute`, {
          statusCode: 403,
          body: { message: "You don't have permissions to do that." },
        }).as("executeActionForbidden");

        mountSdk(
          <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
            <ComponentWithHook actionId={actionId} />

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
    });

    it("should clear result and error when reset() is called", () => {
      cy.get<number>("@actionId").then((actionId) => {
        cy.intercept("POST", `/api/action/${actionId}/execute`).as(
          "executeAction",
        );

        const ComponentWithResetButton = () => {
          const authStatus = useMetabaseAuthStatus();
          const { execute, result, error, isExecuting, reset } = useAction<{
            id: number;
            quantity: number;
          }>(actionId);

          useEffect(() => {
            if (authStatus?.status !== "success") {
              return;
            }
            execute(ACTION_PARAMS).catch(() => {
              // error is captured into hook state; ignore the rethrow
            });
          }, [execute, authStatus?.status]);

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
          '"rows-updated":',
        );

        cy.findByTestId("action-reset").click();

        // The execute succeeded, so `result` was set and `error` never was —
        // asserting `result` returns to "idle" is what proves reset() cleared
        // the populated state.
        cy.findByTestId("action-result").should("have.text", "idle");
      });
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
