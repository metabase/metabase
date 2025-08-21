import {
  InteractiveQuestion,
  type MetabaseDashboard,
  MetabaseProvider,
  useCreateDashboardApi,
  useMetabaseAuthStatus,
} from "@metabase/embedding-sdk-react";
import { useEffect, useState } from "react";

import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  DEFAULT_SDK_AUTH_PROVIDER_CONFIG,
  mountSdk,
} from "e2e/support/helpers/embedding-sdk-component-testing";

describe("scenarios > embedding-sdk > sdk-bundle public hooks", () => {
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
});
