import userEvent from "@testing-library/user-event";

import { createMockEntitiesState } from "__support__/store";
import {
  getIcon,
  queryIcon,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import {
  createMockActionDashboardCard,
  createMockCard,
  createMockDashboardCard,
  createMockIFrameDashboardCard,
  createMockLinkDashboardCard,
  createMockNativeDatasetQuery,
  createMockNativeQuery,
  createMockParameter,
  createMockStructuredDatasetQuery,
  createMockTemplateTag,
  createMockTextDashboardCard,
  createMockVirtualCard,
  createMockVirtualDashCard,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { DashCardCardParameterMapper } from "./DashCardCardParameterMapper";

const QUESTION_ID = 1;

const state = createMockState({
  entities: createMockEntitiesState({
    databases: [createSampleDatabase()],
    questions: [createMockCard({ id: QUESTION_ID })],
  }),
});

const metadata = getMetadata(state); // metabase-lib Metadata instance

const setup = (options) => {
  const card = options.card ?? createMockCard();

  const { rerender } = renderWithProviders(
    <DashCardCardParameterMapper
      card={card}
      dashcard={createMockDashboardCard({ card })}
      question={new Question(card, metadata)}
      editingParameter={createMockParameter()}
      isRecentlyAutoConnected={false}
      mappingOptions={[]}
      isMobile={false}
      {...options}
    />,
  );

  const resultRerender = (newOptions) => {
    const card = newOptions.card ?? createMockCard();

    return rerender(
      <DashCardCardParameterMapper
        card={card}
        dashcard={createMockDashboardCard({ card })}
        question={new Question(card, metadata)}
        editingParameter={createMockParameter()}
        isRecentlyAutoConnected={false}
        mappingOptions={[]}
        isMobile={false}
        {...newOptions}
      />,
    );
  };

  return { rerender: resultRerender };
};

describe("DashCardCardParameterMapper", () => {
  it("should render an unauthorized state for a card with no dataset query", () => {
    const card = createMockCard({
      dataset_query: createMockStructuredDatasetQuery({ query: {} }),
    });
    setup({ card });

    expect(getIcon("key")).toBeInTheDocument();
    expect(
      screen.getByLabelText(/permission to see this question/i),
    ).toBeInTheDocument();
  });

  describe("Action cards", () => {
    it("should render an informative error state for action cards", () => {
      setup({
        dashcard: createMockActionDashboardCard(),
      });
      expect(getIcon("info")).toBeInTheDocument();
      expect(
        screen.getByLabelText(/action settings to connect variables/i),
      ).toBeInTheDocument();
    });
  });

  describe("Virtual cards", () => {
    it("should render an informative parameter mapping state for link cards without variables", () => {
      const dashcard = createMockLinkDashboardCard({ size_x: 4, size_y: 4 });
      setup({
        dashcard,
      });
      expect(getIcon("info")).toBeInTheDocument();
      expect(
        screen.getByText(
          "You can connect widgets to {{variables}} in link cards.",
        ),
      ).toBeInTheDocument();
    });

    it("should render an informative parameter mapping state for text cards without variables", () => {
      const textCard = createMockTextDashboardCard({ size_x: 4, size_y: 4 });
      setup({
        dashcard: textCard,
      });
      expect(getIcon("info")).toBeInTheDocument();
      expect(
        screen.getByText(
          "You can connect widgets to {{variables}} in text cards.",
        ),
      ).toBeInTheDocument();
    });

    it("should render an informative parameter mapping state for iframe cards without variables", () => {
      const textCard = createMockIFrameDashboardCard({ size_x: 4, size_y: 4 });
      setup({
        dashcard: textCard,
      });
      expect(getIcon("info")).toBeInTheDocument();
      expect(
        screen.getByText(
          "You can connect widgets to {{variables}} in iframe cards.",
        ),
      ).toBeInTheDocument();
    });

    it("should render a different header for virtual cards", () => {
      const textCard = createMockVirtualCard({ display: "text" });

      setup({
        card: textCard,
        dashcard: createMockVirtualDashCard({
          card: textCard,
          size_y: 3,
        }),
        mappingOptions: ["foo", "bar"],
      });

      expect(screen.getByText(/Variable to map to/i)).toBeInTheDocument();
    });

    it("should not cut off warning text", async () => {
      const dashcard_1_1 = createMockActionDashboardCard();
      const dashcard_2_4 = createMockActionDashboardCard({
        size_x: 2,
        size_y: 4,
      });
      const dashcard_4_4 = createMockActionDashboardCard({
        size_x: 4,
        size_y: 4,
      });

      const expectCardText = (text) => {
        expect(screen.getByText(text)).toBeInTheDocument();
      };

      const expectTooltipText = async (text) => {
        const infoIcon = getIcon("info");
        expect(infoIcon).toBeInTheDocument();

        await userEvent.hover(infoIcon);

        expect(await screen.findByRole("tooltip")).toHaveTextContent(text);
      };

      const { rerender } = setup({
        card: dashcard_1_1.card,
        dashcard: dashcard_1_1,
      });

      await expectTooltipText(
        "Open this card's action settings to connect variables",
      );

      rerender({
        card: dashcard_2_4.card,
        dashcard: dashcard_2_4,
      });

      await expectTooltipText(
        "Open this card's action settings to connect variables",
      );

      rerender({
        card: dashcard_4_4.card,
        dashcard: dashcard_4_4,
      });

      expectCardText("Open this card's action settings to connect variables");
    });
  });

  it("should render mapping for a non-native, non-virtual, non-action card", () => {
    const card = createMockCard({
      dataset_query: createMockStructuredDatasetQuery({
        query: {
          "source-table": 1,
        },
      }),
    });

    setup({
      card,
      mappingOptions: [
        {
          target: ["dimension", ["field", 1]],
          sectionName: "Section",
          name: "Name",
        },
      ],
      target: ["dimension", ["field", 1]],
    });

    expect(screen.getByText("Section.Name")).toBeInTheDocument();
  });

  describe("Auto-connected hint", () => {
    it("should render 'Auto-connected' message on auto-wire", () => {
      const card = createMockCard();
      const dashcard = createMockDashboardCard({
        card,
        size_y: 4,
      });

      setup({
        dashcard,
        card,
        mappingOptions: [
          {
            target: ["dimension", ["field", 1]],
            sectionName: "Section",
            name: "Name",
          },
        ],
        target: ["dimension", ["field", 1]],
        isRecentlyAutoConnected: true,
      });

      expect(screen.getByText("Auto-connected")).toBeInTheDocument();
      expect(getIcon("sparkles")).toBeInTheDocument();
    });

    it("should not render 'Auto-connected' message on auto-wire when no dashcards mapped", () => {
      const card = createMockCard();
      const dashcard = createMockDashboardCard({ card });

      setup({
        dashcard,
        card,
        isRecentlyAutoConnected: true,
      });

      expect(screen.queryByText("Auto-connected")).not.toBeInTheDocument();
      expect(queryIcon("sparkles")).not.toBeInTheDocument();
    });

    it("should render only an icon when a dashcard is short", async () => {
      const card = createMockCard();
      const dashcard = createMockDashboardCard({ card, size_y: 3, size_x: 5 });

      setup({
        dashcard,
        card,
        mappingOptions: [
          {
            target: ["dimension", ["field", 1]],
            sectionName: "Section",
            name: "Name",
          },
        ],
        target: ["dimension", ["field", 1]],
        isRecentlyAutoConnected: true,
      });

      expect(screen.queryByText("Auto-connected")).not.toBeInTheDocument();
      expect(
        await screen.findByRole("img", { name: /sparkles/ }),
      ).toBeInTheDocument();
    });

    it("should not render an icon when a dashcard is narrow", () => {
      const card = createMockCard();
      const dashcard = createMockDashboardCard({ card, size_y: 3, size_x: 3 });

      setup({
        dashcard,
        card,
        mappingOptions: [
          {
            target: ["dimension", ["field", 1]],
            sectionName: "Section",
            name: "Name",
          },
        ],
        target: ["dimension", ["field", 1]],
        isRecentlyAutoConnected: true,
      });

      expect(screen.queryByText("Auto-connected")).not.toBeInTheDocument();
      expect(queryIcon("sparkles")).not.toBeInTheDocument();
    });
  });

  it("should render an error state when a field is not present in the list of options", () => {
    const card = createMockCard({
      dataset_query: createMockStructuredDatasetQuery({
        query: {
          "source-table": 1,
        },
      }),
      display: "scalar",
    });
    setup({
      card,
      dashcard: createMockDashboardCard({
        card,
      }),
      mappingOptions: [{ target: ["dimension", ["field", 1]] }],
      target: ["dimension", ["field", 2]],
      isMobile: true,
    });
    expect(screen.getByText(/unknown field/i)).toBeInTheDocument();
  });

  it("should render an error state when mapping to a native model", () => {
    const card = createMockCard({
      type: "model",
      dataset_query: createMockNativeDatasetQuery({
        native: {
          query: "SELECT * FROM ORDERS",
        },
      }),
      display: "table",
    });
    setup({
      card,
      dashcard: createMockDashboardCard({
        card,
      }),
      mappingOptions: [],
    });
    expect(screen.getByText(/Models are data sources/)).toBeInTheDocument();
  });

  it("should show header content when card is more than 2 units high", () => {
    const numberCard = createMockCard({
      dataset_query: createMockStructuredDatasetQuery({}),
      display: "scalar",
    });
    setup({
      card: numberCard,
      dashcard: createMockDashboardCard({
        card: numberCard,
        size_y: 3,
      }),
      mappingOptions: ["foo", "bar"],
    });
    expect(screen.getByText(/Column to filter on/i)).toBeInTheDocument();
  });

  it("should hide header content when card is less than 3 units high", () => {
    const numberCard = createMockCard({
      dataset_query: createMockStructuredDatasetQuery({}),
      display: "scalar",
    });
    setup({
      card: numberCard,
      dashcard: createMockDashboardCard({
        card: numberCard,
        size_y: 2,
      }),
      mappingOptions: ["foo", "bar"],
    });
    expect(screen.queryByText(/Column to filter on/i)).not.toBeInTheDocument();
  });

  describe("Action parameter", () => {
    it("should show action parameter warning if an action parameter is used", () => {
      const dashcard = createMockActionDashboardCard({ size_x: 6, size_y: 6 });

      setup({
        card: dashcard.card,
        dashcard,
        target: ["variable", ["template-tag", "source"]],
      });
      expect(
        screen.getByText(
          /Action parameters only accept a single value\. They do not support dropdown lists/i,
        ),
      ).toBeInTheDocument();
    });

    it("should not cut off warning text", async () => {
      const dashcard_1_1 = createMockActionDashboardCard();
      const dashcard_2_4 = createMockActionDashboardCard({
        size_x: 2,
        size_y: 4,
      });
      const dashcard_4_4 = createMockActionDashboardCard({
        size_x: 4,
        size_y: 4,
      });
      const dashcard_6_6 = createMockActionDashboardCard({
        size_x: 6,
        size_y: 6,
      });

      const expectCardText = () => {
        expect(
          screen.getByText(
            "Action parameters only accept a single value. They do not support dropdown lists or search box filters, and can't limit values for linked filters.",
          ),
        ).toBeInTheDocument();
      };

      const expectTooltipText = async () => {
        const infoIcon = getIcon("info");
        expect(infoIcon).toBeInTheDocument();

        await userEvent.hover(infoIcon);

        expect(await screen.findByRole("tooltip")).toHaveTextContent(
          "Action parameters only accept a single value. They do not support dropdown lists or search box filters, and can't limit values for linked filters.",
        );
      };

      const { rerender } = setup({
        card: dashcard_1_1.card,
        dashcard: dashcard_1_1,
        target: ["variable", ["template-tag", "source"]],
      });

      await expectTooltipText();

      rerender({
        card: dashcard_2_4.card,
        dashcard: dashcard_2_4,
        target: ["variable", ["template-tag", "source"]],
      });

      await expectTooltipText();

      rerender({
        card: dashcard_4_4.card,
        dashcard: dashcard_4_4,
        target: ["variable", ["template-tag", "source"]],
      });

      await expectTooltipText();

      rerender({
        card: dashcard_6_6.card,
        dashcard: dashcard_6_6,
        target: ["variable", ["template-tag", "source"]],
      });

      expectCardText();
    });
  });

  describe("Native question", () => {
    it("should not show native question variable warning if a native question variable is used", () => {
      const card = createMockCard({
        dataset_query: createMockNativeDatasetQuery({
          dataset_query: {
            native: createMockNativeQuery({
              query: "SELECT * FROM ACCOUNTS WHERE source = {{ source }}",
              "template-tags": [createMockTemplateTag({ name: "source" })],
            }),
          },
        }),
      });
      setup({
        card,
        dashcard: createMockDashboardCard({ card }),
        target: ["variable", ["template-tag", "source"]],
      });
      expect(screen.queryByText(/Native question/i)).not.toBeInTheDocument();
    });

    it("should not show native question variable warning without single value explanation if parameter is date type", () => {
      const card = createMockCard({
        dataset_query: createMockNativeDatasetQuery({
          dataset_query: {
            native: createMockNativeQuery({
              query: "SELECT * FROM ORDERS WHERE created_at = {{ created_at }}",
              "template-tags": [
                createMockTemplateTag({
                  name: "created_at",
                  type: "date/month-year",
                }),
              ],
            }),
          },
        }),
      });
      setup({
        card,
        dashcard: createMockDashboardCard({ card }),
        target: ["variable", ["template-tag", "created_at"]],
        editingParameter: createMockParameter({ type: "date/month-year" }),
      });
      expect(screen.queryByText(/Native question/i)).not.toBeInTheDocument();
    });
  });

  describe("mobile", () => {
    it("should show header content when card is more than 2 units high", () => {
      const numberCard = createMockCard({
        dataset_query: createMockStructuredDatasetQuery({}),
        display: "scalar",
      });
      setup({
        card: numberCard,
        dashcard: createMockDashboardCard({
          card: numberCard,
          size_y: 2,
        }),
        mappingOptions: ["foo", "bar"],
        isMobile: true,
      });
      expect(screen.getByText(/Column to filter on/i)).toBeInTheDocument();
    });

    it("should hide header content when card is less than 3 units high", () => {
      const textCard = createMockVirtualCard({ display: "text" });

      setup({
        card: textCard,
        dashcard: createMockVirtualCard({
          card: textCard,
          size_y: 3,
        }),
        mappingOptions: ["foo", "bar"],
        isMobile: true,
      });
      expect(screen.queryByText(/Variable to map to/i)).not.toBeInTheDocument();
    });
  });
});
