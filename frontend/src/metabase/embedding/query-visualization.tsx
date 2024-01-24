import { useContext, useEffect, useState } from "react";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import type { CardId } from "metabase-types/api";
import { EmbeddingContext } from "metabase/embedding/context";
import { PublicMode } from "metabase/visualizations/click-actions/modes/PublicMode";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { PublicApi } from "metabase/services";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/Question";

interface QueryVisualizationProps {
  questionId: CardId;
}

export const QueryVisualizationSdk = (
  props: QueryVisualizationProps,
): JSX.Element => {
  // const { apiUrl, secretKey } = useContext(EmbeddingContext);
  const metadata = useSelector(getMetadata);
  const { questionId } = props;

  const [state, setState] = useState({
    card: null,
    result: null,
    initialized: false,
  });

  useEffect(() => {
    PublicApi.card({ uuid: questionId }).then(card => {
      setState(prevState => ({
        ...prevState,
        card,
      }));
    });
  }, [questionId]);

  // className,
  // isRunning,
  // isObjectDetail,
  // isResultDirty,
  // isNativeEditorOpen,
  // result,
  // loadingMessage,
  // maxTableRows

  const { card, result } = state;

  const question = new Question(card, metadata);

  return (
    <LoadingAndErrorWrapper
      className="flex-full"
      loading={!result}
      error={typeof result === "string" ? result : null}
      noWrapper
    >
      {() => (
        <QueryVisualization
          question={question}
          isRunning={!result}
          mode={PublicMode}
        />
      )}
    </LoadingAndErrorWrapper>
  );
};
