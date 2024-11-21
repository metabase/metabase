import fetchMock from "fetch-mock";
import { Route } from "react-router";
import _ from "underscore";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupPublicCardQueryEndpoints,
  setupPublicQuestionEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { registerStaticVisualizations } from "metabase/static-viz/register";
import type { VisualizationProps } from "metabase/visualizations/types";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockEmbedDataset,
  createMockPublicCard,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { PublicOrEmbeddedQuestion } from "../PublicOrEmbeddedQuestion";

registerStaticVisualizations();

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

export type SetupOpts = {
  hash?: Record<string, string>;
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: TokenFeatures;
  questionName: string;
  uuid: string;
};

export async function setup(
  {
    hash = {},
    hasEnterprisePlugins,
    tokenFeatures = createMockTokenFeatures(),
    questionName,
    uuid,
  }: SetupOpts = { questionName: "", uuid: "" },
) {
  mockSettings({
    "token-features": tokenFeatures,
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  setupPublicQuestionEndpoints(
    uuid,
    createMockPublicCard({ name: questionName }),
  );
  setupPublicCardQueryEndpoints(
    uuid,
    createMockEmbedDataset({
      data: { rows: [["John W."]] },
    }),
  );

  if (hash.locale) {
    fetchMock.get(`path:/app/locales/${hash.locale}.json`, {
      headers: {
        language: "ko",
        "plural-forms": "nplurals=1; plural=0;",
      },
      translations: {
        "": {},
      },
    });
  }

  renderWithProviders(
    <Route path="public/question/:uuid" component={PublicOrEmbeddedQuestion} />,
    {
      storeInitialState: createMockState(),
      withRouter: true,
      initialRoute: `public/question/${uuid}${_.isEmpty(hash) ? "" : `#${new URLSearchParams(hash)}`}`,
    },
  );
  expect(await screen.findByText(questionName)).toBeInTheDocument();
  await waitForLoaderToBeRemoved();
}
