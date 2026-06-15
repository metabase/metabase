import type { StoryFn } from "@storybook/react";
import type { JSONContent } from "@tiptap/react";
import { HttpResponse, http } from "msw";
import { type ReactNode, useMemo } from "react";
import _ from "underscore";

import { getStore } from "__support__/entities-store";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import {
  ForceDocumentCardRenderDecorator,
  createWaitForChartsDecorator,
} from "__support__/storybook";
import { getNextId } from "__support__/utils";
import { AppColorSchemeProvider } from "metabase/AppColorSchemeProvider";
import { Api } from "metabase/api";
import { Editor } from "metabase/documents/components/Editor/Editor";
import { commonReducers } from "metabase/reducers-common";
import { MetabaseReduxProvider } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { createMockState } from "metabase/redux/store/mocks";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import {
  HEATMAP_COLS,
  HEATMAP_DISPLAY,
  HEATMAP_ROWS,
  HEATMAP_SNAPSHOT_DELAY_MS,
  useHeatmapPlugin,
} from "./calendar-heatmap-fixtures";

const CARD_ID = getNextId();

const HEATMAP_CARD = createMockCard({
  id: CARD_ID,
  name: "Calendar heatmap",
  display: HEATMAP_DISPLAY,
});

const HEATMAP_RESULT = createMockDataset({
  data: createMockDatasetData({ cols: HEATMAP_COLS, rows: HEATMAP_ROWS }),
});

const DOCUMENT_CONTENT: JSONContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Activity heatmap for 2024" }],
    },
    {
      type: "resizeNode",
      content: [
        {
          type: "cardEmbed",
          attrs: { id: CARD_ID, name: null },
        },
      ],
    },
    { type: "paragraph" },
  ],
};

function DocumentProviders({
  theme,
  children,
}: {
  theme: "light" | "dark";
  children: ReactNode;
}) {
  const store = useMemo(() => {
    const storeInitialState = createMockState({
      settings: mockSettings(),
      entities: createMockEntitiesState({}),
    });
    const commonReducerNames = Object.keys(commonReducers);
    const initialState = _.pick(
      storeInitialState,
      ...commonReducerNames,
    ) as State;
    return getStore(commonReducers, initialState, [Api.middleware]);
  }, []);

  return (
    <AppColorSchemeProvider forceColorScheme={theme}>
      <MetabaseReduxProvider store={store}>{children}</MetabaseReduxProvider>
    </AppColorSchemeProvider>
  );
}

const Template: StoryFn<{ theme: "light" | "dark" }> = ({ theme }) => {
  const ready = useHeatmapPlugin();

  return (
    <DocumentProviders theme={theme}>
      {ready ? (
        <Editor initialContent={DOCUMENT_CONTENT} editable={false} />
      ) : null}
    </DocumentProviders>
  );
};

// Render the card eagerly, then hold the snapshot until the heatmap paints.
const decorators = [
  ForceDocumentCardRenderDecorator,
  createWaitForChartsDecorator({
    count: 1,
    settleMs: HEATMAP_SNAPSHOT_DELAY_MS,
  }),
];

export default {
  title: "viz/CustomViz/CalendarHeatmap/Document",
  render: Template,
  parameters: {
    layout: "fullscreen",
    msw: {
      handlers: [
        http.get(`/api/card/${CARD_ID}`, () => HttpResponse.json(HEATMAP_CARD)),
        http.get(`/api/card/${CARD_ID}/query_metadata`, () =>
          HttpResponse.json(createMockCardQueryMetadata()),
        ),
        http.post(`/api/card/${CARD_ID}/query`, () =>
          HttpResponse.json(HEATMAP_RESULT),
        ),
      ],
    },
  },
};

export const Light = {
  render: Template,
  args: { theme: "light" as const },
  decorators,
};

export const Dark = {
  render: Template,
  args: { theme: "dark" as const },
  decorators,
};
