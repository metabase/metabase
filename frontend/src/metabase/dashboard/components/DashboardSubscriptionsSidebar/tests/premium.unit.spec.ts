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

  [
    {
      channel: "email",
      buttonText: "Email it",
      headerText: "Email this dashboard",
    },
    {
      channel: "slack",
      buttonText: "Send it to Slack",
      headerText: "Send this dashboard to Slack",
    },
  ].forEach(({ channel, buttonText, headerText }) => {
    it(`${channel} channel: should not show advanced filtering options with no mapped parameters`, async () => {
      setup({
        isAdmin: true,
        [channel]: true,
        tokenFeatures,
        enterprisePlugins: ["sharing"],
        dashcards: [
          createMockDashboardCard({
            parameter_mappings: [],
          }),
        ],
      });

      await userEvent.click(await screen.findByText(buttonText));

      screen.getByText(headerText);

      expect(hasAdvancedFilterOptionsHidden(screen)).toBe(true);
    });

    it(`${channel} channel: should show all mapped parameters in advanced filtering options`, async () => {
      const totalParameter = createMockParameter({
        id: "1",
        type: "number/=",
        slug: "total",
        name: "Total",
      });
      const titleParameter = createMockParameter({
        id: "2",
        type: "string/contains",
        slug: "title",
        name: "Title",
      });
      const mockCardNumeric = createMockCard({
        id: 1,
        name: "Numeric Question",
        display: "table",
        parameters: [totalParameter],
      });
      const mockCardString = createMockCard({
        id: 2,
        name: "String Question",
        display: "pie",
        parameters: [titleParameter],
      });

      setup({
        isAdmin: true,
        [channel]: true,
        tokenFeatures,
        enterprisePlugins: ["sharing"],
        parameters: [totalParameter, titleParameter],
        dashcards: [
          createMockDashboardCard({
            id: mockCardNumeric.id,
            card: mockCardNumeric,
            card_id: mockCardNumeric.id,
            parameter_mappings: [
              {
                card_id: mockCardNumeric.id,
                parameter_id: totalParameter.id,
                target: ["variable", ["template-tag", totalParameter.slug]],
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
                parameter_id: titleParameter.id,
                target: [
                  "dimension",
                  ["field", titleParameter.slug, { "base-type": "type/Text" }],
                ],
              },
            ],
          }),
        ],
      });

      await userEvent.click(await screen.findByText(buttonText));

      screen.getByText(headerText);

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

    it(`${channel} channel: should show only mapped parameters in advanced filtering options`, async () => {
      const totalParameter = createMockParameter({
        id: "1",
        type: "number/=",
        slug: "total",
        name: "Total",
      });
      const titleParameter = createMockParameter({
        id: "2",
        type: "string/contains",
        slug: "title",
        name: "Title",
      });
      const mockCardNumeric = createMockCard({
        id: 1,
        name: "Numeric Question",
        display: "table",
        parameters: [totalParameter],
      });
      const mockCardString = createMockCard({
        id: 2,
        name: "String Question",
        display: "pie",
        parameters: [titleParameter],
      });

      setup({
        isAdmin: true,
        [channel]: true,
        tokenFeatures,
        enterprisePlugins: ["sharing"],
        parameters: [totalParameter, titleParameter],
        dashcards: [
          createMockDashboardCard({
            id: mockCardNumeric.id,
            card: mockCardNumeric,
            card_id: mockCardNumeric.id,
            parameter_mappings: [
              {
                card_id: mockCardNumeric.id,
                parameter_id: totalParameter.id,
                target: ["variable", ["template-tag", totalParameter.slug]],
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

      await userEvent.click(await screen.findByText(buttonText));

      screen.getByText(headerText);

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
