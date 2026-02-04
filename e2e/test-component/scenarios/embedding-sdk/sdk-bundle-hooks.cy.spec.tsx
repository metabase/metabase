import {
  InteractiveQuestion,
  type MetabaseDashboard,
  MetabaseProvider,
  useApplicationName,
  useAvailableFonts,
  useCreateDashboardApi,
  useCurrentUser,
  useMetabaseAuthStatus,
} from "@metabase/embedding-sdk-react";
import { useEffect, useState } from "react";

import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  getDefaultSdkAuthProviderConfig,
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
        <MetabaseProvider authConfig={getDefaultSdkAuthProviderConfig()}>
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

          <MetabaseProvider authConfig={getDefaultSdkAuthProviderConfig()}>
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

          <MetabaseProvider authConfig={getDefaultSdkAuthProviderConfig()} />
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
        <MetabaseProvider authConfig={getDefaultSdkAuthProviderConfig()}>
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

          <MetabaseProvider authConfig={getDefaultSdkAuthProviderConfig()}>
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

          <MetabaseProvider authConfig={getDefaultSdkAuthProviderConfig()} />
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
        <MetabaseProvider authConfig={getDefaultSdkAuthProviderConfig()}>
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

          <MetabaseProvider authConfig={getDefaultSdkAuthProviderConfig()}>
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

          <MetabaseProvider authConfig={getDefaultSdkAuthProviderConfig()} />
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
        <MetabaseProvider authConfig={getDefaultSdkAuthProviderConfig()}>
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

          <MetabaseProvider authConfig={getDefaultSdkAuthProviderConfig()}>
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

          <MetabaseProvider authConfig={getDefaultSdkAuthProviderConfig()} />
        </>,
      );

      cy.findByTestId("fonts-list").should("contain.text", "Lato");
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
        <MetabaseProvider authConfig={getDefaultSdkAuthProviderConfig()}>
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

          <MetabaseProvider authConfig={getDefaultSdkAuthProviderConfig()}>
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

          <MetabaseProvider authConfig={getDefaultSdkAuthProviderConfig()} />
        </>,
      );

      cy.findByTestId("current-user").should(
        "have.text",
        "admin@metabase.test",
      );
    });
  });
});
