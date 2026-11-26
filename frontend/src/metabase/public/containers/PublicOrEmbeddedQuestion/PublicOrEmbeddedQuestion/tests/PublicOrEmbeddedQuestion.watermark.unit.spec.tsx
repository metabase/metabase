import {
  setupEmbedQuestionEndpoints,
  setupPublicCardQueryEndpoints,
  setupPublicQuestionEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import * as embeddingConfig from "metabase/embedding/config";
import { Route } from "metabase/router";
import { registerVisualizations } from "metabase/visualizations/register";
import {
  createMockCard,
  createMockColumn,
  createMockEmbedDataset,
  createMockPublicCard,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { PublicOrEmbeddedQuestion } from "../PublicOrEmbeddedQuestion";

// The setup of the other specs here mocks the visualization, which draws the watermark.
registerVisualizations();

const UUID = "00000000-0000-4000-8000-000000000000";
const TOKEN = "embed-token";

const CARD_DETAILS = {
  name: "Orders by year",
  display: "table" as const,
};

const DATASET = createMockEmbedDataset({
  data: {
    cols: [
      createMockColumn({
        name: "TOTAL",
        display_name: "Total",
        base_type: "type/Float",
        effective_type: "type/Float",
      }),
    ],
    rows: [[39.72], [117.03]],
  },
});

const SURFACES = [
  {
    surface: "a public question",
    route: "public/question/:uuid",
    path: `public/question/${UUID}`,
    setupSurface: () => {
      jest.spyOn(embeddingConfig, "isPublicEmbedding").mockReturnValue(true);
      setupPublicQuestionEndpoints(UUID, createMockPublicCard(CARD_DETAILS));
      setupPublicCardQueryEndpoints(UUID, DATASET);
    },
  },
  {
    surface: "a static embedded question",
    route: "embed/question/:token",
    path: `embed/question/${TOKEN}`,
    setupSurface: () => {
      jest.spyOn(embeddingConfig, "isStaticEmbedding").mockReturnValue(true);
      setupEmbedQuestionEndpoints(TOKEN, createMockCard(CARD_DETAILS), DATASET);
    },
  },
];

type SetupOpts = {
  route: string;
  path: string;
  setupSurface: () => void;
  isDevelopmentMode: boolean;
};

async function setup({
  route,
  path,
  setupSurface,
  isDevelopmentMode,
}: SetupOpts) {
  setupSurface();

  renderWithProviders(
    <Route path={route} element={<PublicOrEmbeddedQuestion />} />,
    {
      storeInitialState: createMockState({
        settings: mockSettings({
          "token-features": createMockTokenFeatures({
            development_mode: isDevelopmentMode,
          }),
        }),
      }),
      withRouter: true,
      initialRoute: path,
    },
  );

  // the second row, so the watermark check runs once the results are drawn
  expect(await screen.findByText("117.03")).toBeInTheDocument();
}

describe("PublicOrEmbeddedQuestion > development watermark", () => {
  beforeEach(() => {
    mockGetBoundingClientRect({ width: 800, height: 400 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(SURFACES)(
    "shows the watermark on $surface in development mode",
    async (surface) => {
      await setup({ ...surface, isDevelopmentMode: true });

      expect(screen.getByTestId("development-watermark")).toBeInTheDocument();
    },
  );

  it.each(SURFACES)(
    "does not show the watermark on $surface outside development mode",
    async (surface) => {
      await setup({ ...surface, isDevelopmentMode: false });

      expect(
        screen.queryByTestId("development-watermark"),
      ).not.toBeInTheDocument();
    },
  );
});
