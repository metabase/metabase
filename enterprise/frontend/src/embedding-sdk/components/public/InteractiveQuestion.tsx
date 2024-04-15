import cx from "classnames";
import { useEffect } from "react";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  initializeQB,
  navigateToNewCardInsideQB,
  updateQuestion,
} from "metabase/query_builder/actions";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import { FilterHeader } from "metabase/query_builder/components/view/ViewHeader/components";
import {
  getCard,
  getFirstQueryResult,
  getQuestion,
  getUiControls,
} from "metabase/query_builder/selectors";
import { Group, Stack } from "metabase/ui";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import type { CardId } from "metabase-types/api";

import { useEmbeddingContext } from "../../context";

interface InteractiveQuestionProps {
  questionId: CardId;
}

export const InteractiveQuestion = ({
  questionId,
}: InteractiveQuestionProps): JSX.Element | null => {
  const { isInitialized, isLoggedIn } = useEmbeddingContext();
  const dispatch = useDispatch();
  const question = useSelector(getQuestion);
  const mode = question && getEmbeddingMode(question);
  const card = useSelector(getCard);
  const result = useSelector(getFirstQueryResult);
  const uiControls = useSelector(getUiControls);

  const { isRunning } = uiControls;

  useEffect(() => {
    // TODO: change pathname based on isInteractive value to trigger proper QB viewMode
    const mockLocation = {
      query: {}, // TODO: add here wrapped parameterValues
      hash: "",
      pathname: `/question/${questionId}`,
    };
    const params = {
      slug: `${questionId}`,
    };

    dispatch(initializeQB(mockLocation, params));
  }, [dispatch, questionId]);

  if (!isInitialized || !isLoggedIn || !question) {
    return null;
  }

  return (
    <LoadingAndErrorWrapper
      className={cx(CS.flexFull, CS.fullWidth)}
      loading={!result}
      error={typeof result === "string" ? result : null}
      noWrapper
    >
      {() => (
        <Stack h="100%">
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
              className={cx(CS.flexFull, CS.fullWidth)}
              question={question}
              rawSeries={[{ card, data: result && result.data }]}
              isRunning={isRunning}
              isObjectDetail={false}
              isResultDirty={false}
              isNativeEditorOpen={false}
              result={result}
              noHeader
              mode={mode}
              navigateToNewCardInsideQB={(props: any) => {
                dispatch(navigateToNewCardInsideQB(props));
              }}
            />
          </Group>
        </Stack>
      )}
    </LoadingAndErrorWrapper>
  );
};
