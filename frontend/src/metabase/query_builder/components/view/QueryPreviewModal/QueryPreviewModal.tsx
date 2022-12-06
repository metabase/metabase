import React, { useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import { MetabaseApi } from "metabase/services";
import ModalContent from "metabase/components/ModalContent";
import { formatNativeQuery } from "metabase/lib/engine";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { DatasetNativeForm } from "metabase-types/api";
import Question from "metabase-lib/Question";
import { normalizeParameters } from "metabase-lib/parameters/utils/parameter-values";
import QueryPreviewPanel from "../QueryPreviewPanel";

export interface QueryPreviewModalProps {
  question: Question;
  onClose?: () => void;
}

const QueryPreviewModal = ({ question, onClose }: QueryPreviewModalProps) => {
  const { data, loading, error } = useNativeQuery(question);
  const code = useFormattedQuery(question, data);

  return (
    <ModalContent title={t`Query preview`} onClose={onClose}>
      <LoadingAndErrorWrapper loading={loading} error={error}>
        {code && <QueryPreviewPanel code={code} />}
      </LoadingAndErrorWrapper>
    </ModalContent>
  );
};

interface UseNativeQueryResult {
  data: DatasetNativeForm | undefined;
  loading: boolean;
  error: unknown;
}

const useNativeQuery = (question: Question): UseNativeQueryResult => {
  const [result, setResult] = useState<UseNativeQueryResult>({
    data: undefined,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const query = question.datasetQuery();
    const parameters = normalizeParameters(question.parameters());

    MetabaseApi.native({ ...query, parameters })
      .then(data => setResult({ data, loading: false, error: null }))
      .catch(error => setResult({ data: undefined, loading: false, error }));
  }, [question]);

  return result;
};

const useFormattedQuery = (question: Question, data?: DatasetNativeForm) => {
  const query = data?.query;
  const engine = question.database()?.engine;

  return useMemo(() => formatNativeQuery(query, engine), [query, engine]);
};

export default QueryPreviewModal;
