import userEvent from "@testing-library/user-event";

import { screen, within } from "__support__/ui";
import {
  createMockCard,
  createMockDashboardCard,
  createMockParameter,
} from "metabase-types/api/mocks";

import { hasAdvancedFilterOptionsHidden, setup } from "./setup";

describe("DashboardSubscriptionsSidebar Premium Features", () => {
  const tokenFeatures = {
    dashboard_subscription_filters: true,
  };

  describe("Email Subscription sidebar", () => {
    it("should not show advanced filtering options with no mapped parameters", async () => {
      setup({
        isAdmin: true,
        email: true,
        tokenFeatures,
        hasEnterprisePlugins: true,
        dashcards: [
          createMockDashboardCard({
            parameter_mappings: [],
          }),
        ],
      });

      await userEvent.click(await screen.findByText("Email it"));

      await screen.findByText("Email this dashboard");

      expect(hasAdvancedFilterOptionsHidden(screen)).toBe(true);
    });

    it("should show all mapped parameters in advanced filtering options", async () => {
      const TOTAL_PARAMETER = createMockParameter({
        id: "1",
        type: "number/=",
        slug: "total",
        name: "Total",
      });
      const TITLE_PARAMETER = createMockParameter({
        id: "2",
        type: "string/contains",
        slug: "title",
        name: "Title",
      });
      const mockCardNumeric = createMockCard({
        id: 1,
        name: "Numeric Question",
        display: "table",
        parameters: [TOTAL_PARAMETER],
      });
      const mockCardString = createMockCard({
        id: 2,
        name: "String Question",
        display: "pie",
        parameters: [TITLE_PARAMETER],
      });

      setup({
        isAdmin: true,
        email: true,
        tokenFeatures,
        hasEnterprisePlugins: true,
        parameters: [TOTAL_PARAMETER, TITLE_PARAMETER],
        dashcards: [
          createMockDashboardCard({
            id: mockCardNumeric.id,
            card: mockCardNumeric,
            card_id: mockCardNumeric.id,
            parameter_mappings: [
              {
                card_id: mockCardNumeric.id,
                parameter_id: TOTAL_PARAMETER.id,
                target: ["variable", ["template-tag", TOTAL_PARAMETER.slug]],
              },
            ],
          }),
          createMockDashboardCard({
            id: mockCardString.id,
            card: mockCardString,
            card_id: mockCardString.id,
            parameter_mappings: [
              {
                card_id: mockCardString.id,
                parameter_id: TITLE_PARAMETER.id,
                target: [
                  "dimension",
                  ["field", TITLE_PARAMETER.slug, { "base-type": "type/Text" }],
                ],
              },
            ],
          }),
        ],
      });

      await userEvent.click(await screen.findByText("Email it"));

      await screen.findByText("Email this dashboard");

      const subscriptionParametersSection = screen.getByTestId(
        "subscription-parameters-section",
      );

      expect(subscriptionParametersSection).toBeInTheDocument();

      expect(
        await within(subscriptionParametersSection).findByLabelText("Total"),
      ).toBeInTheDocument();
      expect(
        await within(subscriptionParametersSection).findByLabelText("Title"),
      ).toBeInTheDocument();
    });

    it("should show only mapped parameters in advanced filtering options", async () => {
      const TOTAL_PARAMETER = createMockParameter({
        id: "1",
        type: "number/=",
        slug: "total",
        name: "Total",
      });
      const TITLE_PARAMETER = createMockParameter({
        id: "2",
        type: "string/contains",
        slug: "title",
        name: "Title",
      });
      const mockCardNumeric = createMockCard({
        id: 1,
        name: "Numeric Question",
        display: "table",
        parameters: [TOTAL_PARAMETER],
      });
      const mockCardString = createMockCard({
        id: 2,
        name: "String Question",
        display: "pie",
        parameters: [TITLE_PARAMETER],
      });

      setup({
        isAdmin: true,
        email: true,
        tokenFeatures,
        hasEnterprisePlugins: true,
        parameters: [TOTAL_PARAMETER, TITLE_PARAMETER],
        dashcards: [
          createMockDashboardCard({
            id: mockCardNumeric.id,
            card: mockCardNumeric,
            card_id: mockCardNumeric.id,
            parameter_mappings: [
              {
                card_id: mockCardNumeric.id,
                parameter_id: TOTAL_PARAMETER.id,
                target: ["variable", ["template-tag", TOTAL_PARAMETER.slug]],
              },
            ],
          }),
          createMockDashboardCard({
            id: mockCardString.id,
            card: mockCardString,
            card_id: mockCardString.id,
            parameter_mappings: [],
          }),
        ],
      });

      await userEvent.click(await screen.findByText("Email it"));

      await screen.findByText("Email this dashboard");

      const subscriptionParametersSection = screen.getByTestId(
        "subscription-parameters-section",
      );

      expect(subscriptionParametersSection).toBeInTheDocument();

      expect(
        await within(subscriptionParametersSection).findByLabelText("Total"),
      ).toBeInTheDocument();
      expect(
        within(subscriptionParametersSection).queryByLabelText("Title"),
      ).not.toBeInTheDocument();
    });
  });

  describe("Slack Subscription sidebar", () => {
    it("should not show advanced filtering options with no mapped parameters", async () => {
      setup({
        isAdmin: true,
        slack: true,
        tokenFeatures,
        hasEnterprisePlugins: true,
        dashcards: [
          createMockDashboardCard({
            parameter_mappings: [],
          }),
        ],
      });

      await userEvent.click(await screen.findByText("Send it to Slack"));

      await screen.findByText("Send this dashboard to Slack");

      expect(hasAdvancedFilterOptionsHidden(screen)).toBe(true);
    });

    it("should show all mapped parameters in advanced filtering options", async () => {
      const TOTAL_PARAMETER = createMockParameter({
        id: "1",
        type: "number/=",
        slug: "total",
        name: "Total",
      });
      const TITLE_PARAMETER = createMockParameter({
        id: "2",
        type: "string/contains",
        slug: "title",
        name: "Title",
      });
      const mockCardNumeric = createMockCard({
        id: 1,
        name: "Numeric Question",
        display: "table",
        parameters: [TOTAL_PARAMETER],
      });
      const mockCardString = createMockCard({
        id: 2,
        name: "String Question",
        display: "pie",
        parameters: [TITLE_PARAMETER],
      });

      setup({
        isAdmin: true,
        slack: true,
        tokenFeatures,
        hasEnterprisePlugins: true,
        parameters: [TOTAL_PARAMETER, TITLE_PARAMETER],
        dashcards: [
          createMockDashboardCard({
            id: mockCardNumeric.id,
            card: mockCardNumeric,
            card_id: mockCardNumeric.id,
            parameter_mappings: [
              {
                card_id: mockCardNumeric.id,
                parameter_id: TOTAL_PARAMETER.id,
                target: ["variable", ["template-tag", TOTAL_PARAMETER.slug]],
              },
            ],
          }),
          createMockDashboardCard({
            id: mockCardString.id,
            card: mockCardString,
            card_id: mockCardString.id,
            parameter_mappings: [
              {
                card_id: mockCardString.id,
                parameter_id: TITLE_PARAMETER.id,
                target: [
                  "dimension",
                  ["field", TITLE_PARAMETER.slug, { "base-type": "type/Text" }],
                ],
              },
            ],
          }),
        ],
      });

      await userEvent.click(await screen.findByText("Send it to Slack"));

      await screen.findByText("Send this dashboard to Slack");

      const subscriptionParametersSection = screen.getByTestId(
        "subscription-parameters-section",
      );

      expect(subscriptionParametersSection).toBeInTheDocument();

      expect(
        await within(subscriptionParametersSection).findByLabelText("Total"),
      ).toBeInTheDocument();
      expect(
        await within(subscriptionParametersSection).findByLabelText("Title"),
      ).toBeInTheDocument();
    });

    it("should show only mapped parameters in advanced filtering options", async () => {
      const TOTAL_PARAMETER = createMockParameter({
        id: "1",
        type: "number/=",
        slug: "total",
        name: "Total",
      });
      const TITLE_PARAMETER = createMockParameter({
        id: "2",
        type: "string/contains",
        slug: "title",
        name: "Title",
      });
      const mockCardNumeric = createMockCard({
        id: 1,
        name: "Numeric Question",
        display: "table",
        parameters: [TOTAL_PARAMETER],
      });
      const mockCardString = createMockCard({
        id: 2,
        name: "String Question",
        display: "pie",
        parameters: [TITLE_PARAMETER],
      });

      setup({
        isAdmin: true,
        slack: true,
        tokenFeatures,
        hasEnterprisePlugins: true,
        parameters: [TOTAL_PARAMETER, TITLE_PARAMETER],
        dashcards: [
          createMockDashboardCard({
            id: mockCardNumeric.id,
            card: mockCardNumeric,
            card_id: mockCardNumeric.id,
            parameter_mappings: [
              {
                card_id: mockCardNumeric.id,
                parameter_id: TOTAL_PARAMETER.id,
                target: ["variable", ["template-tag", TOTAL_PARAMETER.slug]],
              },
            ],
          }),
          createMockDashboardCard({
            id: mockCardString.id,
            card: mockCardString,
            card_id: mockCardString.id,
            parameter_mappings: [],
          }),
        ],
      });

      await userEvent.click(await screen.findByText("Send it to Slack"));

      await screen.findByText("Send this dashboard to Slack");

      const subscriptionParametersSection = screen.getByTestId(
        "subscription-parameters-section",
      );

      expect(subscriptionParametersSection).toBeInTheDocument();

      expect(
        await within(subscriptionParametersSection).findByLabelText("Total"),
      ).toBeInTheDocument();
      expect(
        within(subscriptionParametersSection).queryByLabelText("Title"),
      ).not.toBeInTheDocument();
    });
  });
});
