import { useEffect } from "react";
import type { CardId } from "metabase-types/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  getCard,
  getFirstQueryResult,
  getMode,
  getQuestion,
  getUiControls,
} from "metabase/query_builder/selectors";
import {
  initializeQB,
  navigateToNewCardInsideQB,
  updateQuestion,
} from "metabase/query_builder/actions";
import { Group, Stack } from "metabase/ui";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { FilterHeader } from "metabase/query_builder/components/view/ViewHeader/components";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";

import { NotLoggedInBlock } from "../NotLoggedInBlock";
import { useEmbeddingContext } from "../../../hooks/private/use-sdk-context";

interface InteractiveQuestionProps {
  questionId: CardId;
}

export const InteractiveQuestionSdk = (
  props: InteractiveQuestionProps,
): JSX.Element | null => {
  const { isInitialized, isLoggedIn } = useEmbeddingContext();
  const dispatch = useDispatch();
  const mode = useSelector(getMode);
  const question = useSelector(getQuestion);
  const card = useSelector(getCard);
  const result = useSelector(getFirstQueryResult);
  const uiControls = useSelector(getUiControls);

  const { questionId } = props;
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

  if (!isInitialized) {
    return null;
  }

  if (!isLoggedIn) {
    return <NotLoggedInBlock />;
  }

  return (
    <LoadingAndErrorWrapper
      className="flex-full full-width"
      loading={!result}
      error={typeof result === "string" ? result : null}
      noWrapper
    >
      {() => {
        if (!question) {
          return null;
        }

        return (
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
                className="full-width flex-full"
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
        );
      }}
    </LoadingAndErrorWrapper>
  );
};
