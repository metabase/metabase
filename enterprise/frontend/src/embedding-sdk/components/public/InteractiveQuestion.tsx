import cx from "classnames";
import { useEffect } from "react";

import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import type { SdkClickActionPluginsConfig } from "embedding-sdk/lib/plugins";
import { useSdkSelector } from "embedding-sdk/store";
import { getPlugins } from "embedding-sdk/store/selectors";
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

interface InteractiveQuestionProps {
  questionId: CardId;

  plugins?: SdkClickActionPluginsConfig;
}

export const _InteractiveQuestion = ({
  questionId,
  plugins: componentPlugins,
}: InteractiveQuestionProps): JSX.Element | null => {
  const globalPlugins = useSdkSelector(getPlugins);

  const dispatch = useDispatch();
  const question = useSelector(getQuestion);
  const plugins = componentPlugins || globalPlugins;
  const mode = question && getEmbeddingMode(question, plugins || undefined);
  const card = useSelector(getCard);
  const result = useSelector(getFirstQueryResult);
  const uiControls = useSelector(getUiControls);

  // const location = useRouter();
  // const previousLocation = usePrevious(location);

  const { isRunning } = uiControls;

  useEffect(() => {
    const { location, params } = getQuestionParameters(questionId);
    dispatch(initializeQB(location, params));
  }, [dispatch, questionId]);

  // useEffect(() => {
  //   if (previousLocation && location !== previousLocation) {
  //     locationChanged(previousLocation, location);
  //   }
  // }, [location, previousLocation, locationChanged]);

  if (!question) {
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

export const InteractiveQuestion =
  withPublicComponentWrapper(_InteractiveQuestion);

const getQuestionParameters = (questionId: CardId) => {
  return {
    location: {
      query: {}, // TODO: add here wrapped parameterValues
      hash: "",
      pathname: `/question/${questionId}`,
    },
    params: {
      slug: questionId.toString(),
    },
  };
};
