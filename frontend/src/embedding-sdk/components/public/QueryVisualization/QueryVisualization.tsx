import { useEffect, useState } from "react";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { GET, POST } from "metabase/lib/api";
import { useSelector } from "metabase/lib/redux";
import {
  onCloseChartType,
  onOpenChartSettings,
  setUIControls,
} from "metabase/query_builder/actions";
import ChartTypeSidebar from "metabase/query_builder/components/view/sidebars/ChartTypeSidebar";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Button, Group, Text } from "metabase/ui";
import { PublicMode } from "metabase/visualizations/click-actions/modes/PublicMode";
import Question from "metabase-lib/v1/Question";
import type { Card, CardId, Dataset } from "metabase-types/api";

import { useEmbeddingContext } from "../../../hooks";

import { QueryVisualizationSdkWrapper } from "./QueryVisualization.styled";

interface QueryVisualizationProps {
  questionId: CardId;
  showVisualizationSelector?: boolean;
}

type State = {
  loading: boolean;
  card: Card | null;
  result: Dataset | null;
};

export const QueryVisualizationSdk = (
  props: QueryVisualizationProps,
): JSX.Element | null => {
  const { isInitialized, isLoggedIn } = useEmbeddingContext();
  const metadata = useSelector(getMetadata);

  const { questionId } = props;

  const [state, setState] = useState<State>({
    loading: false,
    card: null,
    result: null,
  });

  const loadCardData = async ({ questionId }: { questionId: number }) => {
    setState(prevState => ({
      ...prevState,
      loading: true,
    }));

    Promise.all([
      GET("/api/card/:cardId")({ cardId: questionId }),
      POST("/api/card/:cardId/query")({
        cardId: questionId,
      }),
    ])
      .then(([card, result]) => {
        setState(prevState => ({
          ...prevState,
          card,
          result,
          loading: false,
        }));
      })
      .catch(([_cardError, resultError]) => {
        setState(prevState => ({
          ...prevState,
          result: resultError?.data,
        }));
      });
  };

  useEffect(() => {
    if (!isInitialized || !isLoggedIn) {
      setState({
        loading: false,
        card: null,
        result: null,
      });

      return;
    }

    loadCardData({ questionId });
  }, [isInitialized, isLoggedIn, questionId]);

  const { card, result } = state;

  const changeVisualization = (newQuestion: Question) => {
    setState({
      card: newQuestion.card(),
      result: state.result,
      loading: false,
    });
  };

  if (!isInitialized) {
    return null;
  }

  if (!isLoggedIn) {
    return (
      <div>
        <Text>You should be logged in to see this content.</Text>
        <Button>Log in</Button>
      </div>
    );
  }

  return (
    <LoadingAndErrorWrapper
      className="flex-full full-width"
      loading={!result}
      error={typeof result === "string" ? result : null}
      noWrapper
    >
      {() => {
        const question = new Question(card, metadata);
        const legacyQuery = question.legacyQuery({
          useStructuredQuery: true,
        });

        return (
          <Group h="100%" pos="relative" align="flex-start">
            {props.showVisualizationSelector && (
              <Box w="355px">
                <ChartTypeSidebar
                  question={question}
                  result={result}
                  onOpenChartSettings={onOpenChartSettings}
                  onCloseChartType={onCloseChartType}
                  query={legacyQuery}
                  setUIControls={setUIControls}
                  updateQuestion={changeVisualization}
                />
              </Box>
            )}
            <QueryVisualizationSdkWrapper
              className="full-width"
              question={question}
              rawSeries={[{ card, data: result && result.data }]}
              isRunning={state.loading}
              isObjectDetail={false}
              isResultDirty={false}
              isNativeEditorOpen={false}
              result={result}
              noHeader
              mode={PublicMode}
            />
          </Group>
        );
      }}
    </LoadingAndErrorWrapper>
  );
};
