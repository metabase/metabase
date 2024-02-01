import { useEffect, useState } from "react";
import type { Card, CardId, Dataset } from "metabase-types/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useSelector, useDispatch } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import { PublicMode } from "metabase/visualizations/click-actions/modes/PublicMode";
import ChartTypeSidebar from "metabase/query_builder/components/view/sidebars/ChartTypeSidebar";
import {
  onCloseChartType,
  onOpenChartSettings,
  setUIControls,
} from "metabase/query_builder/actions";
import { GET, POST } from "metabase/lib/api";
import { reloadSettings } from "metabase/admin/settings/settings";
import { refreshCurrentUser } from "metabase/redux/user";
import Question from "metabase-lib/Question";

interface QueryVisualizationProps {
  questionId: CardId;
}

type State = {
  loading: boolean;
  card: Card | null;
  result: Dataset | null;
};

export const QueryVisualizationSdk = (
  props: QueryVisualizationProps,
): JSX.Element => {
  const metadata = useSelector(getMetadata);
  const dispatch = useDispatch();

  useEffect(() => {
    Promise.all([dispatch(refreshCurrentUser()), dispatch(reloadSettings())]);
    // Disabling this for now since we change the store with this call, which keeps calling the effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { questionId } = props;

  const [state, setState] = useState<State>({
    loading: false,
    card: null,
    result: null,
  });

  useEffect(() => {
    setState(prevState => ({
      ...prevState,
      loading: true,
    }));
    GET("/api/card/:cardId")({ cardId: questionId }).then(card => {
      setState(prevState => ({
        ...prevState,
        card,
      }));

      POST("/api/card/:cardId/query")({
        cardId: questionId,
      })
        .then(result => {
          setState(prevState => ({
            ...prevState,
            result,
          }));
        })
        .then(() => {
          setState(prevState => ({
            ...prevState,
            loading: false,
          }));
        });
    });
  }, [questionId]);

  const { card, result } = state;

  const changeVisualization = (newQuestion: Question) => {
    setState({
      card: newQuestion.card(),
      result: state.result,
      loading: false,
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
              rawSeries={[{ card, data: result && result.data }]}
              isRunning={state.loading}
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
