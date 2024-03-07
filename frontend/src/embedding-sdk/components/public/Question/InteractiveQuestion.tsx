import { useEffect } from "react";
import type { CardId } from "metabase-types/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
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
  getMode,
  getQuestion,
  getUiControls,
} from "metabase/query_builder/selectors";
import { Button, Group, Stack } from "metabase/ui";

import { useEmbeddingContext } from "../../../hooks/private/use-sdk-context";
import type { SDKContext } from "../../../plugins";
import { COMPUTED_SDK_PLUGINS } from "../../../plugins";
import { NotLoggedInBlock } from "../NotLoggedInBlock";

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

  const appState = useSelector(state => state);

  if (!isInitialized) {
    return null;
  }

  if (!isLoggedIn) {
    return <NotLoggedInBlock />;
  }

  const defaultActions = [
    {
      key: "download",
      label: "Download",
      icon: "download [default]",
      onClick: () => alert("Default download action"),
    },
    {
      key: "alerts",
      label: "Alerts",
      icon: "Alerts [default]",
      onClick: () => alert("Default alerts action"),
    },
  ];

  const context: SDKContext = {
    appState,
  };

  const actions =
    // TODO: wrap in a hook
    // it should calculate the context and pass it to the plugin
    COMPUTED_SDK_PLUGINS.current.questionFooterActions(defaultActions, context);

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
          <Stack h="100%" style={{ border: "1px solid red" }}>
            <p>hello from the embed sdk</p>

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
            {actions.length > 0 && (
              <Group spacing="md">
                {actions.map(action => (
                  <Button
                    key={action.label}
                    onClick={() => action.onClick(question)}
                  >
                    {action.icon}
                  </Button>
                ))}
              </Group>
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
