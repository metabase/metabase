import { render, screen } from "@testing-library/react";
import { getIcon } from "__support__/ui";

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
} from "metabase-types/api/mocks";

import { getMetadata } from "metabase/selectors/metadata";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";
import { createMockEntitiesState } from "__support__/store";

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
  render(
    <DashCardCardParameterMapper
      card={createMockCard()}
      dashcard={createMockDashboardCard()}
      editingParameter={{}}
      target={null}
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

  it("should render an informative error state for action cards", () => {
    setup({
      dashcard: createMockActionDashboardCard(),
    });
    expect(getIcon("info")).toBeInTheDocument();
    expect(
      screen.getByLabelText(/action settings to connect variables/i),
    ).toBeInTheDocument();
  });

  it("should render an informative error state for link cards", () => {
    const linkCard = createMockCard({ dataset_query: {}, display: "link" });
    setup({
      card: linkCard,
      dashcard: createMockDashboardCard({
        visualization_settings: {
          virtual_card: linkCard,
        },
      }),
    });
    expect(getIcon("info")).toBeInTheDocument();
    expect(
      screen.getByLabelText(/cannot connect variables to link cards/i),
    ).toBeInTheDocument();
  });

  it("should render an informative parameter mapping state for text cards without variables", () => {
    const textCard = createMockTextDashboardCard({ size_x: 3, size_y: 3 });
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
      size_x: 3,
      size_y: 3,
    });
    setup({
      dashcard: headingCard,
    });
    expect(getIcon("info")).toBeInTheDocument();
    expect(
      screen.getByText(
        "You can connect widgets to {{variables}} in heading cards.",
      ),
    ).toBeInTheDocument();
  });

  it("should render a different header for virtual cards", () => {
    const textCard = createMockCard({ dataset_query: {}, display: "text" });
    setup({
      card: textCard,
      dashcard: createMockDashboardCard({
        card: textCard,
        size_y: 3,
        visualization_settings: {
          virtual_card: textCard,
        },
      }),
      mappingOptions: ["foo", "bar"],
    });
    expect(screen.getByText(/Variable to map to/i)).toBeInTheDocument();
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
      mappingOptions: [["dimension", ["field", 1]]],
      target: ["dimension", ["field", 2]],
      isMobile: true,
    });
    expect(screen.getByText(/unknown field/i)).toBeInTheDocument();
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
      const textCard = createMockCard({ dataset_query: {}, display: "text" });
      setup({
        card: textCard,
        dashcard: createMockDashboardCard({
          card: textCard,
          size_y: 3,
          visualization_settings: {
            virtual_card: textCard,
          },
        }),
        mappingOptions: ["foo", "bar"],
        isMobile: true,
      });
      expect(screen.queryByText(/Variable to map to/i)).not.toBeInTheDocument();
    });
  });
});
