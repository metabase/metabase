import { useEffect, useState } from "react";
import type { Card, CardId, Dataset } from "metabase-types/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { CardApi } from "metabase/services";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import { PublicMode } from "metabase/visualizations/click-actions/modes/PublicMode";
import ChartTypeSidebar from "metabase/query_builder/components/view/sidebars/ChartTypeSidebar";
import {
  onCloseChartType,
  onOpenChartSettings,
  setUIControls,
  updateQuestion,
} from "metabase/query_builder/actions";
import Question from "metabase-lib/Question";

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
  // const { apiUrl, secretKey } = useContext(EmbeddingContext);
  const metadata = useSelector(getMetadata);
  const { questionId } = props;

  const [state, setState] = useState<State>({
    card: null,
    result: null,
  });

  useEffect(() => {
    CardApi.get({ cardId: questionId }).then(card => {
      setState(prevState => ({
        ...prevState,
        card,
      }));

      CardApi.query({
        cardId: questionId,
      }).then(result => {
        setState(prevState => ({
          ...prevState,
          result,
        }));
      });
    });
  }, [questionId]);

  const { card, result } = state;

  return (
    <LoadingAndErrorWrapper
      className="flex-full full-width"
      loading={!result}
      error={typeof result === "string" ? result : null}
      noWrapper
    >
      {() => {
        const question = new Question(card, metadata);
        const legacyQuery = question.legacyQuery({ useStructuredQuery: true });

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
                updateQuestion={updateQuestion}
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
