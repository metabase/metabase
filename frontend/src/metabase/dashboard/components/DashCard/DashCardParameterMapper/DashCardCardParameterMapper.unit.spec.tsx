import userEvent from "@testing-library/user-event";

import {
  createMockMetadata,
  createMockMetadataFromState,
} from "__support__/metadata";
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
  within,
} from "__support__/ui";
import type { ParameterMappingOption } from "metabase/parameters/utils/mapping-options";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type {
  Card,
  Database,
  Parameter,
  TestQuerySpec,
  TestStageWithSourceSpec,
  VirtualCard,
} from "metabase-types/api";
import {
  createMockActionDashboardCard,
  createMockCard,
  createMockColumn,
  createMockDashboard,
  createMockDashboardCard,
  createMockIFrameDashboardCard,
  createMockLinkDashboardCard,
  createMockMetricDimension,
  createMockParameter,
  createMockTextDashboardCard,
  createMockVirtualCard,
  createMockVirtualDashCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS,
  REVIEWS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { DashCardCardParameterMapper } from "./DashCardCardParameterMapper";
import { DashCardParameterMapper } from "./DashCardParameterMapper";

const QUESTION_ID = 1;

const ORDERS_QUERY = Lib.toJsQuery(
  Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
);

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
      dataset_query: ORDERS_QUERY,
    });

    setup({
      card,
      mappingOptions: DEFAULT_MAPPING_OPTIONS,
      target: ["dimension", ["field", 1, null]],
    });

    expect(screen.getByText("Section.Name")).toBeInTheDocument();
  });

  it("shows only curated metric dimensions", async () => {
    const card = createMockCard({
      type: "metric",
      dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
    });
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
        dataset_query: Lib.createTestJsQuery(
          SAMPLE_PROVIDER,
          DEFAULT_TEST_QUERY,
        ),
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
      dataset_query: ORDERS_QUERY,
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
      query_type: "native",
      dataset_query: Lib.toJsQuery(
        Lib.createTestNativeQuery(SAMPLE_PROVIDER, {
          query: "SELECT * FROM ORDERS",
        }),
      ),
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
      dataset_query: ORDERS_QUERY,
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
      dataset_query: ORDERS_QUERY,
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
        dataset_query: Lib.toJsQuery(
          Lib.createTestNativeQuery(SAMPLE_PROVIDER, {
            query: "SELECT * FROM ACCOUNTS WHERE source = {{ source }}",
            templateTags: {
              source: { type: "text", name: "source" },
            },
          }),
        ),
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
        dataset_query: Lib.toJsQuery(
          Lib.createTestNativeQuery(SAMPLE_PROVIDER, {
            query: "SELECT * FROM ORDERS WHERE created_at = {{ created_at }}",
            templateTags: {
              created_at: { type: "date", name: "created_at" },
            },
          }),
        ),
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
        dataset_query: ORDERS_QUERY,
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
    createMockColumn({
      name: "ID",
      display_name: "ID",
      base_type: "type/BigInteger",
      field_ref: ["field", "ID", { "base-type": "type/BigInteger" }],
    }),
    createMockColumn({
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
    query_type: "native",
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
    query_type: "query",
    dataset_query: Lib.toJsQuery(
      Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [{ source: { type: "table", id: PRODUCTS_ID } }],
      }),
    ),
  });

  const setupConnected = (
    card: Card,
    {
      parameter = TEXT_PARAMETER,
      database = createSampleDatabase(),
      questions = [card],
    }: { parameter?: Parameter; database?: Database; questions?: Card[] } = {},
  ) => {
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
      parameters: [parameter],
    });

    renderWithProviders(
      <DashCardParameterMapper dashcard={dashcard} isMobile={false} />,
      {
        storeInitialState: createMockState({
          entities: createMockEntitiesState({
            databases: [database],
            questions,
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
              props: { parameterId: parameter.id },
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

  describe("multi-stage queries", () => {
    // The sample database mock gives every field the same position. Give the
    // fields their real order, so the picker has to keep it.
    const SAMPLE_DATABASE = createSampleDatabase();
    const FIELD_POSITIONS = new Map(
      [ORDERS, PRODUCTS, PEOPLE, REVIEWS].flatMap((table) =>
        Object.values(table).map((fieldId, position) => [fieldId, position]),
      ),
    );
    const DATABASE: Database = {
      ...SAMPLE_DATABASE,
      tables: SAMPLE_DATABASE.tables?.map((table) => ({
        ...table,
        fields: table.fields?.map((field) => ({
          ...field,
          position:
            typeof field.id === "number"
              ? (FIELD_POSITIONS.get(field.id) ?? field.position)
              : field.position,
        })),
      })),
    };

    const createProvider = (questions: Card[]) =>
      createMetadataProvider({
        metadata: createMockMetadata({ databases: [DATABASE], questions }),
      });

    const ORDERS_QUESTION = createMockCard({
      id: 101,
      name: "Q0 Orders",
      dataset_query: Lib.createTestJsQuery(createProvider([]), {
        stages: [{ source: { type: "table", id: ORDERS_ID } }],
      }),
    });

    const createOrdersQuestionCard = (
      id: number,
      name: string,
      type: Card["type"],
    ) =>
      createMockCard({
        id,
        name,
        type,
        dataset_query: Lib.createTestJsQuery(
          createProvider([ORDERS_QUESTION]),
          {
            stages: [{ source: { type: "card", id: ORDERS_QUESTION.id } }],
          },
        ),
      });

    const BASE_QUESTION = createOrdersQuestionCard(
      102,
      "Base Orders Question",
      "question",
    );
    const BASE_MODEL = createOrdersQuestionCard(
      103,
      "Base Orders Model",
      "model",
    );

    const SOURCE_PROVIDER = createProvider([
      ORDERS_QUESTION,
      BASE_QUESTION,
      BASE_MODEL,
    ]);

    // Q1 - join, custom column, no aggregations, no breakouts
    const createQ1Stage = (sourceCardId: number): TestStageWithSourceSpec => ({
      source: { type: "card", id: sourceCardId },
      expressions: [
        {
          name: "Net",
          value: {
            type: "operator",
            operator: "-",
            args: [
              { type: "column", name: "TOTAL" },
              { type: "column", name: "TAX" },
            ],
          },
        },
      ],
      joins: [
        {
          source: { type: "table", id: REVIEWS_ID },
          strategy: "left-join",
          alias: "Reviews - Product",
          conditions: [
            {
              operator: "=",
              left: { type: "column", name: "PRODUCT_ID" },
              right: { type: "column", fieldId: REVIEWS.PRODUCT_ID },
            },
          ],
        },
      ],
    });

    // Q8 - Q4 (Q1 + 2 aggregations, 3 breakouts) + 2nd stage with join,
    // custom column, 2 aggregations, 2 breakouts
    const createQ8Query = (sourceCardId: number): TestQuerySpec => ({
      stages: [
        {
          ...createQ1Stage(sourceCardId),
          aggregations: [
            { type: "operator", operator: "count" },
            {
              type: "operator",
              operator: "sum",
              args: [{ type: "column", name: "TOTAL" }],
            },
          ],
          breakouts: [
            { type: "column", fieldId: ORDERS.CREATED_AT, unit: "month" },
            {
              type: "column",
              fieldId: PRODUCTS.CATEGORY,
              sourceFieldId: ORDERS.PRODUCT_ID,
            },
            {
              type: "column",
              fieldId: PEOPLE.CREATED_AT,
              sourceFieldId: ORDERS.USER_ID,
              unit: "year",
            },
          ],
        },
        {
          expressions: [
            {
              name: "5 * Count",
              value: {
                type: "operator",
                operator: "*",
                args: [
                  { type: "literal", value: 5 },
                  { type: "column", name: "count" },
                ],
              },
            },
          ],
          joins: [
            {
              source: { type: "table", id: REVIEWS_ID },
              strategy: "left-join",
              alias: "Reviews - Created At: Month",
              conditions: [
                {
                  operator: "=",
                  left: {
                    type: "column",
                    fieldId: ORDERS.CREATED_AT,
                    unit: "month",
                  },
                  right: {
                    type: "column",
                    fieldId: REVIEWS.CREATED_AT,
                    unit: "month",
                  },
                },
              ],
            },
          ],
          aggregations: [
            { type: "operator", operator: "count" },
            {
              type: "operator",
              operator: "sum",
              args: [
                {
                  type: "column",
                  fieldId: REVIEWS.RATING,
                  joinAlias: "Reviews - Created At: Month",
                },
              ],
            },
          ],
          breakouts: [
            {
              type: "column",
              fieldId: REVIEWS.REVIEWER,
              joinAlias: "Reviews - Created At: Month",
            },
            { type: "column", fieldId: PRODUCTS.CATEGORY },
          ],
        },
      ],
    });

    // What the backend returns as the results metadata of a Q8 model
    const Q8_MODEL_RESULT_METADATA = [
      createMockColumn({
        id: REVIEWS.REVIEWER,
        name: "REVIEWER",
        display_name: "Reviews - Created At: Month → Reviewer",
        base_type: "type/Text",
        effective_type: "type/Text",
        field_ref: ["field", "REVIEWER", { "base-type": "type/Text" }],
      }),
      createMockColumn({
        id: PRODUCTS.CATEGORY,
        name: "PRODUCTS__via__PRODUCT_ID__CATEGORY",
        display_name: "Product → Category",
        base_type: "type/Text",
        effective_type: "type/Text",
        semantic_type: "type/Category",
        field_ref: [
          "field",
          "PRODUCTS__via__PRODUCT_ID__CATEGORY",
          { "base-type": "type/Text" },
        ],
      }),
      createMockColumn({
        name: "count",
        display_name: "Count",
        base_type: "type/BigInteger",
        effective_type: "type/BigInteger",
        semantic_type: "type/Quantity",
        field_ref: ["field", "count", { "base-type": "type/BigInteger" }],
      }),
      createMockColumn({
        name: "sum",
        display_name: "Sum of Reviews - Created At: Month → Rating",
        base_type: "type/BigInteger",
        effective_type: "type/BigInteger",
        field_ref: ["field", "sum", { "base-type": "type/BigInteger" }],
      }),
    ];

    const createQ8Card = (
      id: number,
      name: string,
      type: Card["type"],
      sourceCard: Card,
    ) =>
      createMockCard({
        id,
        name,
        type,
        dataset_query: Lib.createTestJsQuery(
          SOURCE_PROVIDER,
          createQ8Query(sourceCard.id),
        ),
        result_metadata: type === "model" ? Q8_MODEL_RESULT_METADATA : [],
      });

    const QUESTION_BASED_QUESTION = createQ8Card(
      201,
      "Question-based Question",
      "question",
      BASE_QUESTION,
    );
    const MODEL_BASED_QUESTION = createQ8Card(
      202,
      "Model-based Question",
      "question",
      BASE_MODEL,
    );
    const QUESTION_BASED_MODEL = createQ8Card(
      203,
      "Question-based Model",
      "model",
      BASE_QUESTION,
    );
    const MODEL_BASED_MODEL = createQ8Card(
      204,
      "Model-based Model",
      "model",
      BASE_MODEL,
    );

    const PIVOT_QUESTION = createMockCard({
      id: 205,
      name: "Question - pivot viz",
      display: "pivot",
      dataset_query: Lib.createTestJsQuery(SOURCE_PROVIDER, {
        stages: [
          {
            ...createQ1Stage(BASE_QUESTION.id),
            aggregations: [{ type: "operator", operator: "count" }],
            breakouts: [
              { type: "column", fieldId: ORDERS.CREATED_AT, unit: "month" },
              {
                type: "column",
                fieldId: PRODUCTS.CATEGORY,
                sourceFieldId: ORDERS.PRODUCT_ID,
              },
            ],
          },
        ],
      }),
    });

    const PARAMETERS = {
      date: createMockParameter({
        id: "date-param",
        name: "Date",
        slug: "date",
        type: "date/all-options",
        sectionId: "date",
      }),
      text: TEXT_PARAMETER,
      number: createMockParameter({
        id: "number-param",
        name: "Number",
        slug: "number",
        type: "number/=",
        sectionId: "number",
      }),
    };

    const ORDERS_DATE_COLUMNS = ["Created At"];
    const ORDERS_NUMBER_COLUMNS = [
      "Subtotal",
      "Tax",
      "Total",
      "Discount",
      "Quantity",
    ];
    const PRODUCTS_DATE_COLUMNS = ["Created At"];
    const PRODUCTS_TEXT_COLUMNS = ["Ean", "Title", "Category", "Vendor"];
    const PRODUCTS_NUMBER_COLUMNS = ["Price", "Rating"];
    const PEOPLE_DATE_COLUMNS = ["Birth Date", "Created At"];
    const PEOPLE_TEXT_COLUMNS = [
      "Address",
      "Email",
      "Password",
      "Name",
      "Source",
    ];
    const PEOPLE_NUMBER_COLUMNS = ["Longitude", "Latitude"];
    const REVIEWS_DATE_COLUMNS = ["Created At"];
    const REVIEWS_TEXT_COLUMNS = ["Reviewer", "Body"];
    const REVIEWS_NUMBER_COLUMNS = ["Rating"];

    // A section title (null when the list hides it) and the column names
    type MappingSection = [string | null, string[]];

    // The Reviews and Product columns are listed twice because both stages
    // offer them under the same section name (metabase#46845).
    const twice = (columns: string[]) => [...columns, ...columns];

    const getQ8QuestionSections = (
      sourceName: string,
    ): Record<keyof typeof PARAMETERS, MappingSection[]> => ({
      date: [
        [sourceName, ORDERS_DATE_COLUMNS],
        ["Reviews", twice(REVIEWS_DATE_COLUMNS)],
        ["Product", twice(PRODUCTS_DATE_COLUMNS)],
        ["User", PEOPLE_DATE_COLUMNS],
        ["Summaries", ["Created At: Month", "User → Created At: Year"]],
      ],
      text: [
        ["Reviews", twice(REVIEWS_TEXT_COLUMNS)],
        ["Product", twice(PRODUCTS_TEXT_COLUMNS)],
        ["User", PEOPLE_TEXT_COLUMNS],
        ["Summaries", ["Product → Category"]],
        [
          "Summaries (2)",
          ["Reviews - Created At: Month → Reviewer", "Product → Category"],
        ],
      ],
      number: [
        [sourceName, [...ORDERS_NUMBER_COLUMNS, "Net"]],
        ["Reviews", twice(REVIEWS_NUMBER_COLUMNS)],
        ["Product", twice(PRODUCTS_NUMBER_COLUMNS)],
        ["User", PEOPLE_NUMBER_COLUMNS],
        ["Summaries", ["Count", "Sum of Total", "5 * Count"]],
        [
          "Summaries (2)",
          ["Count", "Sum of Reviews - Created At: Month → Rating"],
        ],
      ],
    });

    const Q8_MODEL_SECTIONS: Partial<
      Record<keyof typeof PARAMETERS, MappingSection[]>
    > = {
      text: [
        [
          null,
          ["Reviews - Created At: Month → Reviewer", "Product → Category"],
        ],
      ],
      number: [
        [null, ["Count", "Sum of Reviews - Created At: Month → Rating"]],
      ],
    };

    const PIVOT_SECTIONS: Record<keyof typeof PARAMETERS, MappingSection[]> = {
      date: [
        ["Base Orders Question", ORDERS_DATE_COLUMNS],
        ["Reviews", REVIEWS_DATE_COLUMNS],
        // Product is joined implicitly from both Orders and Reviews (metabase#46845)
        ["Product", twice(PRODUCTS_DATE_COLUMNS)],
        ["User", PEOPLE_DATE_COLUMNS],
      ],
      text: [
        ["Reviews", REVIEWS_TEXT_COLUMNS],
        ["Product", twice(PRODUCTS_TEXT_COLUMNS)],
        ["User", PEOPLE_TEXT_COLUMNS],
      ],
      number: [
        ["Base Orders Question", [...ORDERS_NUMBER_COLUMNS, "Net"]],
        ["Reviews", REVIEWS_NUMBER_COLUMNS],
        ["Product", twice(PRODUCTS_NUMBER_COLUMNS)],
        ["User", PEOPLE_NUMBER_COLUMNS],
      ],
    };

    const NO_VALID_FIELDS_TOOLTIP =
      "This card doesn't have any fields or parameters that can be mapped to this parameter type.";

    type SetupMultiStageOpts = {
      card: Card;
      parameterType: keyof typeof PARAMETERS;
    };

    const setupMultiStage = ({ card, parameterType }: SetupMultiStageOpts) =>
      setupConnected(card, {
        parameter: PARAMETERS[parameterType],
        database: DATABASE,
        questions: [
          ORDERS_QUESTION,
          BASE_QUESTION,
          BASE_MODEL,
          QUESTION_BASED_QUESTION,
          MODEL_BASED_QUESTION,
          QUESTION_BASED_MODEL,
          MODEL_BASED_MODEL,
          PIVOT_QUESTION,
        ],
      });

    // Reads the open picker top to bottom: section titles and column names
    const getMappingSections = (): MappingSection[] => {
      const list = within(screen.getByRole("tree"));
      const rows = [
        ...list.queryAllByTestId("list-section-header"),
        ...list.getAllByRole("option"),
      ].sort((a, b) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1,
      );
      return rows.reduce<MappingSection[]>((sections, row) => {
        if (row.getAttribute("role") !== "option") {
          return [...sections, [row.textContent, []]];
        }
        const columnName = row.getAttribute("aria-label") ?? "";
        const lastSection = sections.at(-1);
        if (lastSection == null) {
          return [[null, [columnName]]];
        }
        lastSection[1].push(columnName);
        return sections;
      }, []);
    };

    const openPicker = async () => {
      await userEvent.click(screen.getByRole("button", { name: /Select…/ }));
      expect(await screen.findByRole("tree")).toBeInTheDocument();
    };

    describe.each([
      [
        "question-based question",
        QUESTION_BASED_QUESTION,
        "Base Orders Question",
      ],
      ["model-based question", MODEL_BASED_QUESTION, "Base Orders Model"],
    ])("%s", (_name, card, sourceName) => {
      it.each(["date", "text", "number"] as const)(
        "lists the %s columns of both stages",
        async (parameterType) => {
          setupMultiStage({ card, parameterType });
          await openPicker();
          expect(getMappingSections()).toEqual(
            getQ8QuestionSections(sourceName)[parameterType],
          );
        },
      );
    });

    describe.each([
      ["question-based model", QUESTION_BASED_MODEL],
      ["model-based model", MODEL_BASED_MODEL],
    ])("%s", (_name, card) => {
      it.each(["text", "number"] as const)(
        "lists only the %s columns the model returns",
        async (parameterType) => {
          setupMultiStage({ card, parameterType });
          await openPicker();
          expect(getMappingSections()).toEqual(
            Q8_MODEL_SECTIONS[parameterType],
          );
        },
      );

      it("has no valid fields for a date filter", async () => {
        setupMultiStage({ card, parameterType: "date" });
        const button = screen.getByRole("button", {
          name: NO_VALID_FIELDS_TOOLTIP,
        });
        expect(button).toHaveTextContent("No valid fields");
        expect(button).toBeDisabled();
        expect(
          screen.queryByRole("button", { name: /Select…/ }),
        ).not.toBeInTheDocument();
        await userEvent.hover(within(button).getByText("No valid fields"));
        expect(await screen.findByRole("tooltip")).toHaveTextContent(
          NO_VALID_FIELDS_TOOLTIP,
        );
      });
    });

    it.each(["date", "text", "number"] as const)(
      "does not use an extra filtering stage for a pivot table (%s columns)",
      async (parameterType) => {
        setupMultiStage({ card: PIVOT_QUESTION, parameterType });
        await openPicker();
        expect(getMappingSections()).toEqual(PIVOT_SECTIONS[parameterType]);
      },
    );
  });
});
