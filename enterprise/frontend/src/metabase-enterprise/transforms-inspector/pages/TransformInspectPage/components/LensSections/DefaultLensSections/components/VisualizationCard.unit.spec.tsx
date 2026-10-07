import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupRunInspectorQueryEndpoint } from "__support__/server-mocks/transform";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { deserializeCardFromUrl } from "metabase/common/utils/card";
import { registerVisualizations } from "metabase/visualizations/register";
import type { InspectorCard } from "metabase-types/api";
import {
  createMockCardQueryMetadata,
  createMockColumn,
  createMockDataset,
  createMockInspectorCard,
  createMockTransform,
} from "metabase-types/api/mocks";

import { LensContentProvider } from "../../../LensContent/LensContentContext";

import { VisualizationCard } from "./VisualizationCard";

registerVisualizations();

function setup({ card }: { card: InspectorCard }) {
  const lensId = "lens-1";
  // Chart titles only render as links when the card is large enough to show them.
  mockGetBoundingClientRect({ width: 800, height: 400 });
  fetchMock.post(
    "path:/api/dataset/query_metadata",
    createMockCardQueryMetadata(),
  );
  setupRunInspectorQueryEndpoint(
    1,
    lensId,
    createMockDataset({
      data: {
        rows: [
          ["shipped", 42],
          ["pending", 7],
        ],
        cols: [
          createMockColumn({
            name: "status",
            display_name: "Status",
            base_type: "type/Text",
            source: "breakout",
          }),
          createMockColumn({
            name: "count",
            display_name: "Count",
            base_type: "type/Integer",
            source: "aggregation",
          }),
        ],
      },
    }),
  );

  renderWithProviders(
    <LensContentProvider
      transform={createMockTransform()}
      lens={{
        id: lensId,
        display_name: "Test Lens",
        sections: [],
        cards: [],
      }}
      lensHandle={{ id: lensId }}
      alertsByCardId={{}}
      drillLensesByCardId={{}}
      collectedCardStats={{}}
      navigateToLens={jest.fn()}
      pushNewStats={jest.fn()}
      markCardStartedLoading={jest.fn()}
      markCardLoaded={jest.fn()}
      subscribeToCardLoaded={jest.fn(() => jest.fn())}
    >
      <VisualizationCard card={card} />
    </LensContentProvider>,
  );
}

describe("VisualizationCard", () => {
  it("opens the card as a question that keeps the card's visualization", async () => {
    setup({
      card: createMockInspectorCard({
        title: "Status distribution",
        display: "pie",
      }),
    });

    const titleLink = await screen.findByRole("link", {
      name: "Status distribution",
    });
    // The title only resolves its real href once it's hovered or focused.
    await userEvent.hover(titleLink);
    const serializedCard = titleLink.getAttribute("href")?.split("#")[1] ?? "";

    expect(deserializeCardFromUrl(serializedCard)).toMatchObject({
      display: "pie",
      displayIsLocked: true,
    });
  });
});
