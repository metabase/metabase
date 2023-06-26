import { render, screen } from "@testing-library/react";
import { getIcon } from "__support__/ui";

import {
  createMockCard,
  createMockDashboardOrderedCard,
  createMockActionDashboardCard,
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
      dashcard={createMockDashboardOrderedCard()}
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
    setup();
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
      dashcard: createMockDashboardOrderedCard({
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

  it("should render an informative error state for text cards", () => {
    const textCard = createMockCard({ dataset_query: {}, display: "text" });
    setup({
      card: textCard,
      dashcard: createMockDashboardOrderedCard({
        visualization_settings: {
          virtual_card: textCard,
        },
      }),
    });
    expect(getIcon("info")).toBeInTheDocument();
    expect(screen.getByLabelText(/in text cards/i)).toBeInTheDocument();
  });
});
