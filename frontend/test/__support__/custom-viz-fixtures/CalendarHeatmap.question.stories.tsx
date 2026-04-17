// @ts-expect-error There is no type definition
import createAsyncCallback from "@loki/create-async-callback";
import type { StoryFn } from "@storybook/react";
import { type ReactNode, useEffect, useMemo } from "react";

import { getStore } from "__support__/entities-store";
import { createMockMetadata } from "__support__/metadata";
import { getNextId } from "__support__/utils";
import { AppColorSchemeProvider } from "metabase/AppColorSchemeProvider";
import { Api } from "metabase/api";
// Side-effect import: provides the `#popover-event-target { position: fixed }`
// rule that ChartTooltip relies on to anchor near the hovered cell.
import "metabase/common/components/Popover/Popover.module.css";
import {
  PublicOrEmbeddedQuestionView,
  type PublicOrEmbeddedQuestionViewProps,
} from "metabase/public/containers/PublicOrEmbeddedQuestion/PublicOrEmbeddedQuestionView";
import type { DisplayTheme } from "metabase/public/lib/types";
import { publicReducers } from "metabase/reducers-public";
import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import { MetabaseReduxProvider } from "metabase/utils/redux/custom-context";
import {
  createMockCard,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import {
  HEATMAP_COLS,
  HEATMAP_DISPLAY,
  HEATMAP_ROWS,
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

function QuestionProviders({
  theme,
  children,
}: {
  theme: DisplayTheme;
  children: ReactNode;
}) {
  const store = useMemo(() => {
    const initialState = createMockState({
      settings: createMockSettingsState({ "hide-embed-branding?": false }),
    });
    return getStore(publicReducers, initialState, [Api.middleware]);
  }, []);

  const forceColorScheme = theme === "night" ? "dark" : "light";

  return (
    <AppColorSchemeProvider forceColorScheme={forceColorScheme}>
      <MetabaseReduxProvider store={store}>{children}</MetabaseReduxProvider>
    </AppColorSchemeProvider>
  );
}

const Template: StoryFn<{ theme: DisplayTheme }> = ({ theme }) => {
  const asyncCallback = useMemo(() => createAsyncCallback(), []);
  const ready = useHeatmapPlugin();

  useEffect(() => {
    if (!ready) {
      return;
    }
    const id = setTimeout(asyncCallback, 1200);
    return () => clearTimeout(id);
  }, [ready, asyncCallback]);

  const questionProps: PublicOrEmbeddedQuestionViewProps = {
    initialized: true,
    card: HEATMAP_CARD,
    metadata: createMockMetadata({}),
    titled: true,
    bordered: true,
    theme,
    getParameters: () => [],
    parameterValues: {},
    setParameterValue: async () => undefined,
    setParameterValueToDefault: () => {},
    hide_parameters: null,
    setCard: () => {},
    downloadsEnabled: { pdf: false, results: false },
    result: HEATMAP_RESULT,
  };

  return (
    <QuestionProviders theme={theme}>
      {ready ? <PublicOrEmbeddedQuestionView {...questionProps} /> : null}
    </QuestionProviders>
  );
};

export default {
  title: "viz/CustomViz/CalendarHeatmap/Question",
  render: Template,
  parameters: {
    layout: "fullscreen",
  },
};

export const Light = {
  render: Template,
  args: { theme: "light" as DisplayTheme },
};

export const Dark = {
  render: Template,
  args: { theme: "night" as DisplayTheme },
};
