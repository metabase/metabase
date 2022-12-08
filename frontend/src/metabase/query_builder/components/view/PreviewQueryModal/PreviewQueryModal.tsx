import React, { useEffect, useMemo, useState } from "react";
import { getIn } from "icepick";
import { t } from "ttag";
import { formatNativeQuery } from "metabase/lib/engine";
import MetabaseSettings from "metabase/lib/settings";
import ExternalLink from "metabase/core/components/ExternalLink";
import { NativeQueryForm } from "metabase-types/api";
import Question from "metabase-lib/Question";
import NativeCodePanel from "../NativeCodePanel";
import {
  ModalBody,
  ModalCloseButton,
  ModalCloseIcon,
  ModalDivider,
  ModalFooter,
  ModalHeader,
  ModalLoadingSpinner,
  ModalRoot,
  ModalTitle,
  ModalWarningIcon,
} from "./PreviewQueryModal.styled";

interface PreviewQueryModalProps {
  question: Question;
  onClose?: () => void;
}

const PreviewQueryModal = ({
  question,
  onClose,
}: PreviewQueryModalProps): JSX.Element => {
  const { data, error, isLoading } = useNativeQuery(question);

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
      {error && <ModalDivider />}
      <ModalBody>
        {isLoading ? (
          <ModalLoadingSpinner />
        ) : errorText ? (
          <NativeCodePanel value={errorText} isHighlighted />
        ) : queryText ? (
          <NativeCodePanel value={queryText} isCopyEnabled />
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
  data?: NativeQueryForm;
  error?: unknown;
  isLoading: boolean;
}

const useNativeQuery = (question: Question) => {
  const [state, setState] = useState<UseNativeQuery>({ isLoading: true });

  useEffect(() => {
    question
      .apiGetNativeQueryForm()
      .then(data => setState({ data, isLoading: false }))
      .catch(error => setState({ isLoading: false, error }));
  }, [question]);

  return state;
};

const getErrorMessage = (error: unknown): string | undefined => {
  return getIn(error, ["data", "message"]);
};

export default PreviewQueryModal;
