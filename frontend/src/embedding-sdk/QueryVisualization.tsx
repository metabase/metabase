import { useContext, useEffect, useState } from "react";
import type { Card, CardId, Dataset } from "metabase-types/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import { PublicMode } from "metabase/visualizations/click-actions/modes/PublicMode";
import ChartTypeSidebar from "metabase/query_builder/components/view/sidebars/ChartTypeSidebar";
import {
  onCloseChartType,
  onOpenChartSettings,
  setUIControls,
} from "metabase/query_builder/actions";
import Question from "metabase-lib/Question";
import { useApi } from "./hooks/use-api";
import { EmbeddingContext } from "./context";

interface QueryVisualizationProps {
  questionId: CardId;
}

type State = {
  card: Card | null;
  result: Dataset | null;
};

export const QueryVisualizationSdk = (
  props: QueryVisualizationProps,
): JSX.Element => {
  const { apiUrl, apiKey } = useContext(EmbeddingContext);
  const { GET, POST } = useApi({
    apiUrl,
    apiKey,
  });

  const metadata = useSelector(getMetadata);
  const { questionId } = props;

  const [state, setState] = useState<State>({
    card: null,
    result: null,
  });

  useEffect(() => {
    GET("/api/card/:cardId")({ cardId: questionId }, { apiKey }).then(card => {
      setState(prevState => ({
        ...prevState,
        card,
      }));

      POST("/api/card/:cardId/query")(
        {
          cardId: questionId,
        },
        { apiKey },
      ).then(result => {
        setState(prevState => ({
          ...prevState,
          result,
        }));
      });
    });
  }, [GET, POST, apiKey, questionId]);

  const { card, result } = state;

  const changeVisualization = (newQuestion: Question) => {
    setState({
      card: newQuestion.card(),
      result: state.result,
    });
  };

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
          <div
            style={{
              height: "600px",
              position: "relative",
              display: "flex",
              flexDirection: "row",
            }}
          >
            <aside
              style={{
                width: "355px",
              }}
            >
              <ChartTypeSidebar
                question={question}
                result={result}
                onOpenChartSettings={onOpenChartSettings}
                onCloseChartType={onCloseChartType}
                query={legacyQuery}
                setUIControls={setUIControls}
                updateQuestion={changeVisualization}
              />
            </aside>
            <QueryVisualization
              className="full-width"
              question={question}
              rawSeries={[{ card: card, data: result && result.data }]}
              isRunning={!result}
              isObjectDetail={false}
              isResultDirty={false}
              isNativeEditorOpen={false}
              result={result}
              noHeader
              mode={PublicMode}
            />
          </div>
        );
      }}
    </LoadingAndErrorWrapper>
  );
};
