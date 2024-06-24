import cx from "classnames";
import type React from "react";
import { useUnmount } from "react-use";
import { t } from "ttag";

import type { SdkClickActionPluginsConfig } from "embedding-sdk";
import {
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import { ResetButton } from "embedding-sdk/components/private/ResetButton";
import { getDefaultVizHeight } from "embedding-sdk/lib/default-height";
import { useSdkSelector } from "embedding-sdk/store";
import { getPlugins } from "embedding-sdk/store/selectors";
import CS from "metabase/css/core/index.css";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  navigateToNewCardInsideQB,
  resetQB,
  updateQuestion,
} from "metabase/query_builder/actions";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import { ViewHeaderContainer } from "metabase/query_builder/components/view/ViewHeader/ViewTitleHeader.styled";
import {
  DashboardBackButton,
  QuestionDescription,
  QuestionFiltersHeader,
} from "metabase/query_builder/components/view/ViewHeader/components";
import {
  getCard,
  getFirstQueryResult,
  getQueryResults,
  getQuestion,
  getUiControls,
} from "metabase/query_builder/selectors";
import { Box, Group, Stack } from "metabase/ui";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import * as Lib from "metabase-lib";

const returnNull = () => null;

interface InteractiveQuestionResultProps {
  isQuestionLoading: boolean;
  onNavigateBack: () => void;
  withResetButton?: boolean;
  onResetButtonClick: () => void;
  withTitle?: boolean;
  customTitle?: React.ReactNode;
  isOpenedFromDashboard?: boolean;

  height?: string | number;
  componentPlugins?: SdkClickActionPluginsConfig;
}

export const InteractiveQuestionResult = ({
  isQuestionLoading,
  componentPlugins,
  onNavigateBack,
  height,
  withResetButton,
  onResetButtonClick,
  withTitle,
  customTitle,
  isOpenedFromDashboard = false,
}: InteractiveQuestionResultProps): React.ReactElement => {
  const dispatch = useDispatch();

  const globalPlugins = useSdkSelector(getPlugins);
  const question = useSelector(getQuestion);
  const card = useSelector(getCard);
  const result = useSelector(getFirstQueryResult);
  const uiControls = useSelector(getUiControls);
  const queryResults = useSelector(getQueryResults);
  const { isRunning: isQueryRunning } = uiControls;

  useUnmount(() => {
    dispatch(resetQB());
  });

  if (isQuestionLoading || isQueryRunning) {
    return <SdkLoader />;
  }

  if (!question || !queryResults) {
    return <SdkError message={t`Question not found`} />;
  }

  const defaultHeight = card ? getDefaultVizHeight(card.display) : undefined;

  const plugins = componentPlugins || globalPlugins;
  const mode = question && getEmbeddingMode(question, plugins || undefined);

  const isSaved = question.isSaved();
  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(query);

  question.alertType = returnNull; // FIXME: this removes "You can also get an alert when there are some results." feature for question

  return (
    <Box
      className={cx(CS.flexFull, CS.fullWidth)}
      h={height ?? defaultHeight}
      bg="var(--mb-color-bg-question)"
    >
      <Stack h="100%">
        <ViewHeaderContainer data-testid="qb-header" isNavBarOpen={false}>
          {isOpenedFromDashboard && (
            <DashboardBackButton noLink onClick={onNavigateBack} />
          )}

          {withTitle &&
            (customTitle || (
              <h2 className={cx(CS.h2, CS.textWrap)}>
                {isSaved ? (
                  question.displayName()
                ) : isNative ? (
                  t`New question`
                ) : (
                  <QuestionDescription question={question} />
                )}
              </h2>
            ))}

          {withResetButton && <ResetButton onClick={onResetButtonClick} />}
        </ViewHeaderContainer>

        {QuestionFiltersHeader.shouldRender({
          question,
          queryBuilderMode: uiControls.queryBuilderMode,
          isObjectDetail: false,
        }) && (
          <QuestionFiltersHeader
            expanded
            question={question}
            updateQuestion={(...args) => dispatch(updateQuestion(...args))}
          />
        )}

        <Group h="100%" pos="relative" align="flex-start">
          <QueryVisualization
            className={cx(CS.flexFull, CS.fullWidth, CS.fullHeight)}
            question={question}
            rawSeries={[{ card, data: result && result.data }]}
            isRunning={isQueryRunning}
            isObjectDetail={false}
            isResultDirty={false}
            isNativeEditorOpen={false}
            result={result}
            noHeader
            mode={mode}
            navigateToNewCardInsideQB={(props: any) => {
              dispatch(navigateToNewCardInsideQB(props));
            }}
            onNavigateBack={onNavigateBack}
          />
        </Group>
      </Stack>
    </Box>
  );
};
