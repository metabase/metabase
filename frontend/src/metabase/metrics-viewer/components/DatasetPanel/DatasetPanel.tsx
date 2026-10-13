import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { serializeExplorerDataset } from "metabase/common/metrics-viewer/dataset-explorer";
import { restoreSummaryParameters } from "metabase/common/metrics-viewer/question-summary";
import { AdHocQuestionLoader } from "metabase/questions/components/AdHocQuestionLoader";
import { useLocation, useNavigate } from "metabase/router";
import { Text } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { DatasetExplorer } from "./DatasetExplorer";

export function DatasetPanel({
  serializedDataset,
  returnTo,
}: {
  serializedDataset: string;
  returnTo: string | null;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [loadDataset, setLoadDataset] = useState(serializedDataset);
  const lastDataset = useRef(serializedDataset);

  useEffect(() => {
    if (serializedDataset !== lastDataset.current) {
      lastDataset.current = serializedDataset;
      setLoadDataset(serializedDataset);
    }
  }, [serializedDataset]);

  const handleChange = (question: Question) => {
    const dataset = serializeExplorerDataset(question);
    lastDataset.current = dataset;
    const params = new URLSearchParams(location.search);
    params.set("dataset", dataset);
    navigate(`/explore?${params}${location.hash}`, { replace: true });
  };

  return (
    <AdHocQuestionLoader questionHash={`#${loadDataset}`}>
      {({ question, loading, error }) => (
        <LoadingAndErrorWrapper loading={loading} error={error} noWrapper>
          {question ? (
            <DatasetExplorer
              key={loadDataset}
              initialQuestion={restoreSummaryParameters(question)}
              returnTo={returnTo}
              onChange={handleChange}
            />
          ) : (
            <Text>{t`This dataset could not be opened.`}</Text>
          )}
        </LoadingAndErrorWrapper>
      )}
    </AdHocQuestionLoader>
  );
}
