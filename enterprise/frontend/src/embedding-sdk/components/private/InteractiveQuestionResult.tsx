import cx from "classnames";
import { t } from "ttag";

import {
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import { ResetButton } from "embedding-sdk/components/private/ResetButton";
import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import {
  navigateToNewCardInsideQB,
  updateQuestion,
} from "metabase/query_builder/actions";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import { QuestionFiltersHeader } from "metabase/query_builder/components/view/ViewHeader/components";
import { Box, Flex, Group, Stack } from "metabase/ui";

interface InteractiveQuestionResultProps {
  onNavigateBack: () => void;
  withResetButton?: boolean;
  onResetButtonClick: () => void;
  withTitle?: boolean;
  customTitle?: React.ReactNode;
  height?: string | number;
}

export const InteractiveQuestionResult = ({
  onNavigateBack,
  height,
  withResetButton,
  onResetButtonClick,
  withTitle,
  customTitle,
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
        <Flex direction="row" gap="md" px="md" align="center">
          {withTitle &&
            (customTitle || (
              <h2 className={cx(CS.h2, CS.textWrap)}>
                {question.displayName()}
              </h2>
            ))}

          {withResetButton && <ResetButton onClick={onResetButtonClick} />}
        </Flex>

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
