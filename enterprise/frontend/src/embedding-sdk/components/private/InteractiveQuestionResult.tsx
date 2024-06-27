import cx from "classnames";
import { t } from "ttag";

import {
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import { QuestionTitle } from "embedding-sdk/components/private/QuestionTitle";
import { ResetButton } from "embedding-sdk/components/private/ResetButton";
import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import {
  navigateToNewCardInsideQB,
  updateQuestion,
} from "metabase/query_builder/actions";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import { ViewHeaderContainer } from "metabase/query_builder/components/view/ViewHeader/ViewTitleHeader.styled";
import {
  QuestionFiltersHeader,
  DashboardBackButton,
} from "metabase/query_builder/components/view/ViewHeader/components";
import { Box, Group, Stack } from "metabase/ui";

interface InteractiveQuestionResultProps {
  isOpenedFromDashboard?: boolean;
  height?: string | number;
}

export const InteractiveQuestionResult = ({
  height,
  isOpenedFromDashboard,
}: InteractiveQuestionResultProps): React.ReactElement => {
  const dispatch = useDispatch();

  const {
    card,
    defaultHeight,
    isQueryRunning,
    isQuestionLoading,
    mode,
    queryResults,
    question,
    result,
    uiControls,
    onReset,
    onNavigateBack,
    withResetButton,
    withTitle,
    customTitle,
  } = useInteractiveQuestionContext();

  if (isQuestionLoading || isQueryRunning) {
    return <SdkLoader />;
  }

  if (!question || !queryResults) {
    return <SdkError message={t`Question not found`} />;
  }

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

          {withTitle && (customTitle || <QuestionTitle question={question} />)}

          {withResetButton && onReset && <ResetButton onClick={onReset} />}
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
