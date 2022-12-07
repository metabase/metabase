import React, { useEffect, useMemo, useState } from "react";
import { getIn } from "icepick";
import { t } from "ttag";
import { formatNativeQuery } from "metabase/lib/engine";
import MetabaseSettings from "metabase/lib/settings";
import ExternalLink from "metabase/core/components/ExternalLink";
import { NativeQueryData } from "metabase-types/api";
import Question from "metabase-lib/Question";
import QueryPreviewCode from "../QueryPreviewCode";
import {
  ModalBody,
  ModalCloseButton,
  ModalCloseIcon,
  ModalFooter,
  ModalHeader,
  ModalLoadingSpinner,
  ModalRoot,
  ModalTitle,
  ModalWarningIcon,
} from "./QueryPreviewModal.styled";

interface QueryPreviewModalProps {
  question: Question;
  onClose?: () => void;
}

const QueryPreviewModal = ({
  question,
  onClose,
}: QueryPreviewModalProps): JSX.Element => {
  const { data, error, loading } = useNativeQuery(question);

  const queryText = useMemo(() => {
    const engine = question.database()?.engine;
    return data ? formatNativeQuery(data.query, engine) : undefined;
  }, [question, data]);

  const errorText = useMemo(() => {
    return error ? getErrorMessage(error) : undefined;
  }, [error]);

  return (
    <ModalRoot>
      <ModalHeader>
        {error && <ModalWarningIcon name="warning" />}
        <ModalTitle>
          {error ? t`An error occurred in your query` : t`Query preview`}
        </ModalTitle>
        <ModalCloseButton>
          <ModalCloseIcon name="close" onClick={onClose} />
        </ModalCloseButton>
      </ModalHeader>
      <ModalBody>
        {loading ? (
          <ModalLoadingSpinner />
        ) : errorText ? (
          <QueryPreviewCode value={errorText} />
        ) : queryText ? (
          <QueryPreviewCode value={queryText} />
        ) : undefined}
      </ModalBody>
      {error && (
        <ModalFooter>
          <ExternalLink
            href={MetabaseSettings.learnUrl("debugging-sql/sql-syntax")}
          >
            {t`Learn how to debug SQL errors`}
          </ExternalLink>
        </ModalFooter>
      )}
    </ModalRoot>
  );
};

interface UseNativeQuery {
  data?: NativeQueryData;
  error?: unknown;
  loading: boolean;
}

const useNativeQuery = (question: Question) => {
  const [state, setState] = useState<UseNativeQuery>({ loading: true });

  useEffect(() => {
    question
      .apiGetNativeQuery()
      .then(data => setState({ data, loading: false }))
      .catch(error => setState({ loading: false, error }));
  }, [question]);

  return state;
};

const getErrorMessage = (error: unknown): string | undefined => {
  return getIn(error, ["data", "message"]);
};

export default QueryPreviewModal;
