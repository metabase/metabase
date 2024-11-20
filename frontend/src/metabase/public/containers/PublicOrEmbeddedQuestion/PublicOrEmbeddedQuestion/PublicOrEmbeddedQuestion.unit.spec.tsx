import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupPublicCardQueryEndpoints,
  setupPublicQuestionEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  getIcon,
  queryIcon,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import registerVisualizations from "metabase/visualizations/register";
import type { VisualizationProps } from "metabase/visualizations/types";
import {
  createMockEmbedDataset,
  createMockPublicCard,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { PublicOrEmbeddedQuestion } from "./PublicOrEmbeddedQuestion";

registerVisualizations();

const FAKE_UUID = "123456";

const QUESTION_NAME = "Public question";

const VisualizationMock = ({
  onUpdateVisualizationSettings,
  rawSeries,
}: VisualizationProps) => {
  const [
    {
      card,
      data: { rows },
    },
  ] = rawSeries;

  return (
    <div>
      <div>
        {rows[0].map((value, i) => (
          <span key={i}>{value}</span>
        ))}
      </div>
      <div data-testid="settings">
        {JSON.stringify(card.visualization_settings)}
      </div>
      <button onClick={() => onUpdateVisualizationSettings({ foo: "bar" })}>
        update settings
      </button>
    </div>
  );
};

jest.mock(
  "metabase/visualizations/components/Visualization",
  () => VisualizationMock,
);

async function setup({
  hash,
}: {
  hash?: string;
} = {}) {
  setupPublicQuestionEndpoints(
    FAKE_UUID,
    createMockPublicCard({ name: QUESTION_NAME }),
  );
  setupPublicCardQueryEndpoints(
    FAKE_UUID,
    createMockEmbedDataset({
      data: { rows: [["John W."]] },
    }),
  );

  renderWithProviders(
    <Route path="public/question/:uuid" component={PublicOrEmbeddedQuestion} />,
    {
      storeInitialState: createMockState(),
      withRouter: true,
      initialRoute: `public/question/${FAKE_UUID}${hash ? "#" + hash : ""}`,
    },
  );
  expect(await screen.findByText(QUESTION_NAME)).toBeInTheDocument();
}

describe("PublicOrEmbeddedQuestion", () => {
  beforeAll(() => {
    mockSettings({
      // the `whitelabel` feature is needed to test #downloads=false
      "token-features": createMockTokenFeatures({ whitelabel: true }),
    });

    setupEnterprisePlugins();
  });

  it("should render data", async () => {
    await setup();
    expect(await screen.findByText("John W.")).toBeInTheDocument();
  });

  it("should update card settings when visualization component changes them (metabase#37429)", async () => {
    await setup();

    await waitForLoaderToBeRemoved();

    await userEvent.click(
      await screen.findByRole("button", {
        name: /update settings/i,
      }),
    );

    await waitForLoaderToBeRemoved();

    expect(screen.getByTestId("settings")).toHaveTextContent(
      JSON.stringify({ foo: "bar" }),
    );
  });

  describe("downloads flag", () => {
    it("should allow downloading the results when downloads are enabled", async () => {
      await setup({ hash: "downloads=true" });
      await waitForLoaderToBeRemoved();

      await userEvent.click(getIcon("download"));

      expect(
        within(screen.getByRole("dialog")).getByRole("heading", {
          name: /download/i,
        }),
      ).toBeInTheDocument();
    });

    it("should not allow downloading results when downloads are enabled", async () => {
      await setup({ hash: "downloads=false" });

      await waitForLoaderToBeRemoved();

      expect(queryIcon("download")).not.toBeInTheDocument();
    });
  });
});
