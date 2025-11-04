import { useMemo } from "react";

import { useGetCardQueryQuery } from "metabase/api";
import DebouncedFrame from "metabase/common/components/DebouncedFrame";
import { useSelector } from "metabase/lib/redux";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";

import S from "./ModelVisualization.module.css";

type ModelVisualizationProps = {
  model: Card;
};

export function ModelVisualization({ model }: ModelVisualizationProps) {
  const metadata = useSelector(getMetadata);
  const question = useMemo(
    () => new Question(model, metadata),
    [model, metadata],
  );

  const { data, isLoading } = useGetCardQueryQuery({ cardId: model.id });
  const rawSeries = useMemo(
    () => (data ? [{ card: model, data: data.data }] : null),
    [model, data],
  );

  return (
    <DebouncedFrame className={S.root}>
      <QueryVisualization
        question={question}
        result={data}
        rawSeries={rawSeries}
        isRunnable={false}
        isRunning={isLoading}
        isDirty
        isResultDirty={false}
      />
    </DebouncedFrame>
  );
}
