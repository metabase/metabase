import userEvent from "@testing-library/user-event";

import { createMockMetadataFromState } from "__support__/metadata";
import { setupMetricDimensionsEndpoints } from "__support__/server-mocks";
import {
  createMockDashboardState,
  createMockState,
  createMockStoreDashboard,
} from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  getIcon,
  queryIcon,
  renderWithProviders,
  screen,
} from "__support__/ui";
import type { ParameterMappingOption } from "metabase/parameters/utils/mapping-options";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { Card, VirtualCard } from "metabase-types/api";
import {
  createMockActionDashboardCard,
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockField,
  createMockIFrameDashboardCard,
  createMockLinkDashboardCard,
  createMockMetricDimension,
  createMockNativeDatasetQuery,
  createMockNativeQuery,
  createMockParameter,
  createMockStructuredDatasetQuery,
  createMockTemplateTag,
  createMockTextDashboardCard,
  createMockVirtualCard,
  createMockVirtualDashCard,
} from "metabase-types/api/mocks";
import {
  PRODUCTS,
  PRODUCTS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { DashCardCardParameterMapper } from "./DashCardCardParameterMapper";
import { DashCardParameterMapper } from "./DashCardParameterMapper";

const QUESTION_ID = 1;

const state = createMockState({
  entities: createMockEntitiesState({
    databases: [createSampleDatabase()],
    questions: [createMockCard({ id: QUESTION_ID })],
  }),
});

const metadata = createMockMetadataFromState(state); // metabase-lib Metadata instance

type MapperProps = React.ComponentProps<typeof DashCardCardParameterMapper>;
type SetupOptions = Partial<MapperProps>;

const DEFAULT_MAPPING_OPTIONS: ParameterMappingOption[] = [
  {
    target: ["dimension", ["field", 1, null]],
    icon: "string",
    isForeign: false,
    sectionName: "Section",
    name: "Name",
  },
];

const TEXT_TAG_MAPPING_OPTION: ParameterMappingOption = {
  name: "foo",
  icon: "string",
  isForeign: false,
  target: ["text-tag", "foo"],
};

const getQuestion = (card: Card | VirtualCard) => {
  return card.name !== null ? new Question(card, metadata) : undefined;
};

const setup = (options: SetupOptions = {}) => {
  const card = options.card ?? createMockCard();
  const dashcard =
    options.dashcard ??
    (card.name !== null
      ? createMockDashboardCard({ card })
      : createMockDashboardCard());

  const { rerender } = renderWithProviders(
    <DashCardCardParameterMapper
      card={card}
      dashcard={dashcard}
      question={getQuestion(card)}
      editingParameter={createMockParameter()}
      isRecentlyAutoConnected={false}
      mappingOptions={[]}
      isMobile={false}
      {...options}
    />,
  );

  const resultRerender = (newOptions: SetupOptions) => {
    const card = newOptions.card ?? createMockCard();
    const dashcard =
      newOptions.dashcard ??
      (card.name !== null
        ? createMockDashboardCard({ card })
        : createMockDashboardCard());

    return rerender(
      <DashCardCardParameterMapper
        card={card}
        dashcard={dashcard}
        question={getQuestion(card)}
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

    it.each(["text", "heading"] as const)(
      "should offer the variables of %s cards as mapping targets",
      async (display) => {
        const card = createMockVirtualCard({ display });
        setup({
          card,
          dashcard: createMockVirtualDashCard({
            card,
            size_x: 4,
            size_y: 4,
          }),
          mappingOptions: [TEXT_TAG_MAPPING_OPTION],
        });

        await userEvent.click(screen.getByText("Select…"));
        expect(await screen.findByText("foo")).toBeInTheDocument();
      },
    );

    it.each(["text", "heading"] as const)(
      "should show the variable a %s card is mapped to",
      (display) => {
        const card = createMockVirtualCard({ display });
        setup({
          card,
          dashcard: createMockVirtualDashCard({
            card,
            size_x: 4,
            size_y: 4,
          }),
          mappingOptions: [TEXT_TAG_MAPPING_OPTION],
          target: TEXT_TAG_MAPPING_OPTION.target,
        });

        expect(screen.getByText("foo")).toBeInTheDocument();
        expect(screen.queryByText("Select…")).not.toBeInTheDocument();
      },
    );

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
        dashcard: createMockVirtualDashCard({ size_y: 3 }),
        mappingOptions: DEFAULT_MAPPING_OPTIONS,
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

      const expectCardText = (text: string) => {
        expect(screen.getByText(text)).toBeInTheDocument();
      };

      const expectTooltipText = async (text: string) => {
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
      mappingOptions: DEFAULT_MAPPING_OPTIONS,
      target: ["dimension", ["field", 1, null]],
    });

    expect(screen.getByText("Section.Name")).toBeInTheDocument();
  });

  it("shows only curated metric dimensions", async () => {
    const card = createMockCard({ type: "metric" });
    setupMetricDimensionsEndpoints(card.id, {
      added: [
        createMockMetricDimension({
          id: "category",
          display_name: "Product category",
          sources: [{ type: "field", "field-id": 2 }],
        }),
        createMockMetricDimension({
          id: "title",
          display_name: "Product title",
          sources: [{ type: "field", "field-id": 1 }],
        }),
      ],
      addable: [],
    });

    setup({
      card,
      mappingOptions: [
        {
          target: ["dimension", ["field", 1, null]],
          icon: "string",
          isForeign: true,
          sectionName: "Product",
          name: "Title",
        },
        {
          target: ["dimension", ["field", 2, null]],
          icon: "string",
          isForeign: true,
          sectionName: "Product",
          name: "Category",
        },
        {
          target: ["dimension", ["field", 3, null]],
          icon: "string",
          isForeign: true,
          sectionName: "User",
          name: "Email",
        },
      ],
    });

    await userEvent.click(await screen.findByText("Select…"));

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("Product category");
    expect(options[1]).toHaveTextContent("Product title");
    // Curated dimensions drop the table sections and the fields left out of the curation
    expect(screen.queryByText("Product")).not.toBeInTheDocument();
    expect(screen.queryByText("User")).not.toBeInTheDocument();
    expect(screen.queryByText("Email")).not.toBeInTheDocument();
  });

  it("shows every mapping option under its table section for a question", async () => {
    setup({
      card: createMockCard({
        type: "question",
        dataset_query: createMockStructuredDatasetQuery({
          query: {
            "source-table": 1,
          },
        }),
      }),
      mappingOptions: [
        {
          target: ["dimension", ["field", 2, null]],
          icon: "string",
          isForeign: true,
          sectionName: "Product",
          name: "Category",
        },
        {
          target: ["dimension", ["field", 3, null]],
          icon: "string",
          isForeign: true,
          sectionName: "User",
          name: "Email",
        },
      ],
    });

    await userEvent.click(await screen.findByText("Select…"));

    expect(screen.getByText("Product")).toBeInTheDocument();
    expect(screen.getByText("User")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Email/ })).toBeInTheDocument();
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
        mappingOptions: DEFAULT_MAPPING_OPTIONS,
        target: ["dimension", ["field", 1, null]],
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
        mappingOptions: DEFAULT_MAPPING_OPTIONS,
        target: ["dimension", ["field", 1, null]],
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
        mappingOptions: DEFAULT_MAPPING_OPTIONS,
        target: ["dimension", ["field", 1, null]],
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
      mappingOptions: DEFAULT_MAPPING_OPTIONS,
      target: ["dimension", ["field", 2, null]],
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
      mappingOptions: DEFAULT_MAPPING_OPTIONS,
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
      mappingOptions: DEFAULT_MAPPING_OPTIONS,
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
          native: createMockNativeQuery({
            query: "SELECT * FROM ACCOUNTS WHERE source = {{ source }}",
            "template-tags": {
              source: createMockTemplateTag({ name: "source" }),
            },
          }),
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
          native: createMockNativeQuery({
            query: "SELECT * FROM ORDERS WHERE created_at = {{ created_at }}",
            "template-tags": {
              created_at: createMockTemplateTag({
                name: "created_at",
                type: "date",
              }),
            },
          }),
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
        mappingOptions: DEFAULT_MAPPING_OPTIONS,
        isMobile: true,
      });
      expect(screen.getByText(/Column to filter on/i)).toBeInTheDocument();
    });

    it("should hide header content when card is less than 3 units high", () => {
      const textCard = createMockVirtualCard({ display: "text" });

      setup({
        card: textCard,
        dashcard: createMockVirtualDashCard({ card: textCard, size_y: 2 }),
        mappingOptions: DEFAULT_MAPPING_OPTIONS,
        isMobile: true,
      });
      expect(screen.queryByText(/Variable to map to/i)).not.toBeInTheDocument();
    });
  });
});

describe("DashCardParameterMapper connected to the dashboard store", () => {
  const DASHBOARD_ID = 10;
  const DASHCARD_ID = 20;
  const MODEL_ID = 30;
  const TEXT_PARAMETER = createMockParameter({
    id: "text-param",
    name: "Text",
    slug: "text",
    type: "string/=",
    sectionId: "string",
  });

  // The model metadata maps CATEGORY to the Products.Category field, so its
  // results metadata offers a column that a text filter could map to.
  const MODEL_RESULT_METADATA = [
    createMockField({
      name: "ID",
      display_name: "ID",
      base_type: "type/BigInteger",
      field_ref: ["field", "ID", { "base-type": "type/BigInteger" }],
    }),
    createMockField({
      id: PRODUCTS.CATEGORY,
      name: "CATEGORY",
      display_name: "Category",
      base_type: "type/Text",
      semantic_type: "type/Category",
      field_ref: ["field", "CATEGORY", { "base-type": "type/Text" }],
    }),
  ];

  const NATIVE_MODEL = createMockCard({
    id: MODEL_ID,
    name: "Native model",
    type: "model",
    display: "table",
    dataset_query: Lib.toJsQuery(
      Lib.createTestNativeQuery(SAMPLE_PROVIDER, {
        query: "select *\nfrom products limit 5",
      }),
    ),
    result_metadata: MODEL_RESULT_METADATA,
  });

  const STRUCTURED_MODEL = createMockCard({
    ...NATIVE_MODEL,
    name: "Structured model",
    dataset_query: Lib.toJsQuery(
      Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [{ source: { type: "table", id: PRODUCTS_ID } }],
      }),
    ),
  });

  const setupConnected = (card: Card) => {
    const dashcard = createMockDashboardCard({
      id: DASHCARD_ID,
      dashboard_id: DASHBOARD_ID,
      card_id: card.id,
      card,
      size_x: 6,
      size_y: 4,
    });
    const dashboard = createMockDashboard({
      id: DASHBOARD_ID,
      parameters: [TEXT_PARAMETER],
    });

    renderWithProviders(
      <DashCardParameterMapper dashcard={dashcard} isMobile={false} />,
      {
        storeInitialState: createMockState({
          entities: createMockEntitiesState({
            databases: [createSampleDatabase()],
            questions: [card],
          }),
          dashboard: createMockDashboardState({
            dashboardId: DASHBOARD_ID,
            dashboards: {
              [DASHBOARD_ID]: createMockStoreDashboard({
                ...dashboard,
                dashcards: [DASHCARD_ID],
              }),
            },
            dashcards: { [DASHCARD_ID]: dashcard },
            editingDashboard: dashboard,
            sidebar: {
              name: "editParameter",
              props: { parameterId: TEXT_PARAMETER.id },
            },
          }),
        }),
      },
    );
  };

  it("should not let a dashboard filter map to a native model with columns mapped to database fields (metabase#23024)", () => {
    setupConnected(NATIVE_MODEL);

    expect(screen.getByText(/Models are data sources/)).toBeInTheDocument();
    expect(screen.queryByText("Select…")).not.toBeInTheDocument();
    expect(screen.queryByText(/Column to filter on/)).not.toBeInTheDocument();
  });

  it("should let the same dashboard filter map to a structured model", async () => {
    setupConnected(STRUCTURED_MODEL);

    expect(screen.getByText(/Column to filter on/)).toBeInTheDocument();
    expect(
      screen.queryByText(/Models are data sources/),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Select…"));
    expect(await screen.findByText("Category")).toBeInTheDocument();
  });
});
