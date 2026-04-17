import { type FC, type PropsWithChildren, useMemo } from "react";

import { FlexibleSizeComponent } from "embedding-sdk-bundle/components/private/FlexibleSizeComponent";
import { withPublicComponentWrapper } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { RenderIfHasContent } from "embedding-sdk-bundle/components/private/RenderIfHasContent/RenderIfHasContent";
import {
  Breakout,
  BreakoutDropdown,
  ChartTypeDropdown,
  ChartTypeSelector,
  DownloadWidget,
  DownloadWidgetDropdown,
  Filter,
  FilterDropdown,
  QuestionResetButton,
  QuestionSettings,
  QuestionSettingsDropdown,
  QuestionVisualization,
  SqlParametersList,
  Summarize,
  SummarizeDropdown,
  Title,
} from "embedding-sdk-bundle/components/private/SdkQuestion/components";
import { ResultToolbar } from "embedding-sdk-bundle/components/private/SdkQuestion/components/ResultToolbar/ResultToolbar";
import { DefaultViewTitle } from "embedding-sdk-bundle/components/private/SdkQuestionDefaultView/DefaultViewTitle";
import InteractiveQuestionS from "embedding-sdk-bundle/components/private/SdkQuestionDefaultView/SdkQuestionDefaultView.module.css";
import {
  SdkQuestion,
  type SdkQuestionProps,
} from "embedding-sdk-bundle/components/public/SdkQuestion/SdkQuestion";
import { QuestionAlertsButton } from "embedding-sdk-bundle/components/public/notifications/QuestionAlertsButton";
import { useNormalizeGuestEmbedQuestionOrDashboardComponentProps } from "embedding-sdk-bundle/hooks/private/use-normalize-guest-embed-question-or-dashboard-component-props";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getIsGuestEmbed } from "embedding-sdk-bundle/store/selectors";
import type {
  SdkQuestionEntityInternalProps,
  SdkQuestionEntityPublicProps,
} from "embedding-sdk-bundle/types/question";
import { Box, Group, Stack } from "metabase/ui";
import { deserializeCardFromQuery } from "metabase/utils/card";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import { EmbeddingSdkStaticMode } from "metabase/visualizations/click-actions/modes/EmbeddingSdkStaticMode";
import type { ClickActionModeGetter } from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";

import { staticQuestionSchema } from "./StaticQuestion.schema";

type StaticQuestionBaseProps = PropsWithChildren<
  Pick<
    SdkQuestionProps,
    | "withChartTypeSelector"
    | "height"
    | "width"
    | "className"
    | "style"
    | "initialSqlParameters"
    | "hiddenParameters"
    | "withDownloads"
    | "withAlerts"
    | "title"
  >
>;

/**
 * @interface
 * @expand
 * @category StaticQuestion
 */
export type StaticQuestionProps = StaticQuestionBaseProps &
  SdkQuestionEntityPublicProps;

/**
 * Internal type that includes the `query` prop used by the `useMetabot` hook.
 * Not re-exported from the public SDK package entry point.
 */
export type StaticQuestionInternalProps = StaticQuestionBaseProps &
  SdkQuestionEntityInternalProps;

/**
 * @interface
 */
export type StaticQuestionComponents = {
  Filter: typeof Filter;
  FilterDropdown: typeof FilterDropdown;
  ResetButton: typeof QuestionResetButton;
  Title: typeof Title;
  Summarize: typeof Summarize;
  SummarizeDropdown: typeof SummarizeDropdown;
  QuestionVisualization: typeof QuestionVisualization;
  ChartTypeSelector: typeof ChartTypeSelector;
  ChartTypeDropdown: typeof ChartTypeDropdown;
  QuestionSettings: typeof QuestionSettings;
  QuestionSettingsDropdown: typeof QuestionSettingsDropdown;
  Breakout: typeof Breakout;
  BreakoutDropdown: typeof BreakoutDropdown;
  DownloadWidget: typeof DownloadWidget;
  DownloadWidgetDropdown: typeof DownloadWidgetDropdown;
  AlertsButton: typeof QuestionAlertsButton;
  SqlParametersList: typeof SqlParametersList;
};

const StaticQuestionInner = (
  props: StaticQuestionInternalProps,
): JSX.Element | null => {
  const query = props.query;

  // Normalize props for Guest Embed usage (e.g. enforce withDownloads in OSS).
  const normalizedProps =
    useNormalizeGuestEmbedQuestionOrDashboardComponentProps(
      props as StaticQuestionProps,
    );

  const {
    questionId,
    token,
    withChartTypeSelector,
    height,
    width,
    className,
    style,
    initialSqlParameters,
    hiddenParameters,
    withDownloads,
    withAlerts,
    title = false, // Hidden by default for backwards-compatibility.
    children,
  } = normalizedProps;

  const deserializedCard = useMemo(
    () => (query ? deserializeCardFromQuery(query) : undefined),
    [query],
  );

  const isGuestEmbed = useSdkSelector(getIsGuestEmbed);

  const getClickActionMode: ClickActionModeGetter = ({
    question,
  }: {
    question: Question;
  }) => {
    return (
      question &&
      getEmbeddingMode({
        question,
        queryMode: EmbeddingSdkStaticMode,
      })
    );
  };

  return (
    <SdkQuestion
      questionId={questionId}
      token={token}
      deserializedCard={deserializedCard}
      getClickActionMode={getClickActionMode}
      navigateToNewCard={null}
      initialSqlParameters={initialSqlParameters}
      hiddenParameters={hiddenParameters}
      withDownloads={withDownloads}
      withAlerts={withAlerts}
    >
      {children ?? (
        <FlexibleSizeComponent
          className={className}
          width={width}
          height={height}
          style={style}
        >
          <Stack
            className={InteractiveQuestionS.Container}
            w="100%"
            h="100%"
            gap="xs"
          >
            <RenderIfHasContent
              component={Stack}
              className={InteractiveQuestionS.TopBar}
              gap="sm"
              p="md"
              data-testid="static-question-top-bar"
            >
              {title && <DefaultViewTitle title={title} />}

              <RenderIfHasContent
                component={ResultToolbar}
                data-testid="result-toolbar"
              >
                {withChartTypeSelector && <SdkQuestion.ChartTypeDropdown />}

                <RenderIfHasContent component={Group} gap="sm" ml="auto">
                  <SdkQuestion.DownloadWidgetDropdown />
                  <QuestionAlertsButton />
                </RenderIfHasContent>
              </RenderIfHasContent>

              {isGuestEmbed && <SdkQuestion.SqlParametersList />}
            </RenderIfHasContent>

            <Box className={InteractiveQuestionS.Main} w="100%" h="100%">
              <Box className={InteractiveQuestionS.Content}>
                <SdkQuestion.QuestionVisualization
                  height={height}
                  width={width}
                  className={className}
                  style={style}
                />
              </Box>
            </Box>
          </Stack>
        </FlexibleSizeComponent>
      )}
    </SdkQuestion>
  );
};

const subComponents: StaticQuestionComponents = {
  Filter: Filter,
  FilterDropdown: FilterDropdown,
  ResetButton: QuestionResetButton,
  Title: Title,
  Summarize: Summarize,
  SummarizeDropdown: SummarizeDropdown,
  QuestionVisualization: QuestionVisualization,
  ChartTypeSelector: ChartTypeSelector,
  ChartTypeDropdown: ChartTypeDropdown,
  QuestionSettings: QuestionSettings,
  QuestionSettingsDropdown: QuestionSettingsDropdown,
  Breakout: Breakout,
  BreakoutDropdown: BreakoutDropdown,
  DownloadWidget: DownloadWidget,
  DownloadWidgetDropdown: DownloadWidgetDropdown,
  AlertsButton: QuestionAlertsButton,
  SqlParametersList: SqlParametersList,
};

const _StaticQuestionWrapped = withPublicComponentWrapper(StaticQuestionInner, {
  supportsGuestEmbed: true,
});

export const StaticQuestion = Object.assign(
  _StaticQuestionWrapped as FC<StaticQuestionProps>,
  subComponents,
  { schema: staticQuestionSchema },
);

/**
 * Same runtime component as {@link StaticQuestion}, typed to accept the
 * internal `query` prop. For use in internal tests only.
 */
export const _StaticQuestionInternal = Object.assign(
  _StaticQuestionWrapped as FC<StaticQuestionInternalProps>,
  subComponents,
  { schema: staticQuestionSchema },
);
