import cx from "classnames";
import { t } from "ttag";

import type { SdkClickActionPluginsConfig } from "embedding-sdk";
import { SdkError } from "embedding-sdk/components/private/PublicComponentWrapper";
import { ResetButton } from "embedding-sdk/components/private/ResetButton";
import { getDefaultVizHeight } from "embedding-sdk/lib/default-height";
import { useSdkSelector } from "embedding-sdk/store";
import { getPlugins } from "embedding-sdk/store/selectors";
import CS from "metabase/css/core/index.css";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  navigateToNewCardInsideQB,
  updateQuestion,
} from "metabase/query_builder/actions";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import { FilterHeader } from "metabase/query_builder/components/view/ViewHeader/components";
import {
  getCard,
  getFirstQueryResult,
  getQueryResults,
  getQuestion,
  getUiControls,
} from "metabase/query_builder/selectors";
import { Box, Flex, Group, Loader, Stack } from "metabase/ui";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";

const returnNull = () => null;

interface InteractiveQuestionResultProps {
  isQuestionLoading: boolean;
  onNavigateBack: () => void;
  withResetButton?: boolean;
  onResetButtonClick: () => void;
  withTitle?: boolean;
  customTitle?: React.ReactNode;

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
}: InteractiveQuestionResultProps): React.ReactElement => {
  const dispatch = useDispatch();

  const globalPlugins = useSdkSelector(getPlugins);
  const question = useSelector(getQuestion);
  const card = useSelector(getCard);
  const result = useSelector(getFirstQueryResult);
  const uiControls = useSelector(getUiControls);
  const queryResults = useSelector(getQueryResults);

  const { isRunning: isQueryRunning } = uiControls;

  if (isQuestionLoading || isQueryRunning || !queryResults) {
    return <Loader data-testid="loading-spinner" />;
  }

  if (!question) {
    return <SdkError message={t`Question not found`} />;
  }

  const defaultHeight = card ? getDefaultVizHeight(card.display) : undefined;

  const plugins = componentPlugins || globalPlugins;
  const mode = question && getEmbeddingMode(question, plugins || undefined);

  question.alertType = returnNull; // FIXME: this removes "You can also get an alert when there are some results." feature for question

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

        {FilterHeader.shouldRender({
          question,
          queryBuilderMode: uiControls.queryBuilderMode,
          isObjectDetail: false,
        }) && (
          <FilterHeader
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
