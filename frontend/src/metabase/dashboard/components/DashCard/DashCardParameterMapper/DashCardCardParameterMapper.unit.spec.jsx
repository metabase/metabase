import { createMockEntitiesState } from "__support__/store";
import { getIcon, renderWithProviders, screen } from "__support__/ui";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import {
  createMockCard,
  createMockTemplateTag,
  createMockDashboardCard,
  createMockActionDashboardCard,
  createMockHeadingDashboardCard,
  createMockParameter,
  createMockTextDashboardCard,
  createMockStructuredDatasetQuery,
  createMockNativeDatasetQuery,
  createMockNativeQuery,
  createMockLinkDashboardCard,
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

const setup = options => {
  const card = options.card ?? createMockCard();

  renderWithProviders(
    <DashCardCardParameterMapper
      card={card}
      dashcard={createMockDashboardCard({ card })}
      question={new Question(card, metadata)}
      editingParameter={createMockParameter()}
      mappingOptions={[]}
      metadata={metadata}
      setParameterMapping={jest.fn()}
      isMobile={false}
      {...options}
    />,
  );
};

describe("DashCardParameterMapper", () => {
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
    it("should render an informative error state for link cards", () => {
      const dashcard = createMockLinkDashboardCard();

      setup({
        card: dashcard.card,
        dashcard,
      });

      expect(getIcon("info")).toBeInTheDocument();
      expect(
        screen.getByLabelText(/cannot connect variables to link cards/i),
      ).toBeInTheDocument();
    });

    it("should render an informative parameter mapping state for text cards without variables", () => {
      const textCard = createMockTextDashboardCard({ size_y: 3 });
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

    it("should render an informative parameter mapping state for heading cards without variables", () => {
      const headingCard = createMockHeadingDashboardCard({
        size_y: 3,
      });
      setup({
        dashcard: headingCard,
        card: headingCard.card,
      });
      expect(getIcon("info")).toBeInTheDocument();
      expect(
        screen.getByText(
          "You can connect widgets to {{variables}} in heading cards.",
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

  describe("Native question", () => {
    it("should show native question variable warning if a native question variable is used", () => {
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
      expect(
        screen.getByText(
          /Native question variables only accept a single value\. They do not support dropdown lists/i,
        ),
      ).toBeInTheDocument();
    });

    it("should show native question variable warning without single value explanation if parameter is date type", () => {
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
      expect(
        screen.getByText(
          /Native question variables do not support dropdown lists/i,
        ),
      ).toBeInTheDocument();
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
