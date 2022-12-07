import React, { useMemo } from "react";
import { getIn } from "icepick";
import { t } from "ttag";
import { formatNativeQuery } from "metabase/lib/engine";
import MetabaseSettings from "metabase/lib/settings";
import ExternalLink from "metabase/core/components/ExternalLink";
import { NativeQueryData } from "metabase-types/api";
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
  data?: NativeQueryData;
  error?: unknown;
  loading?: boolean;
  engine?: string;
  onClose?: () => void;
}

const QueryPreviewModal = ({
  data,
  error,
  engine,
  loading,
  onClose,
}: QueryPreviewModalProps): JSX.Element => {
  const queryText = useMemo(() => {
    return data ? formatNativeQuery(data.query, engine) : undefined;
  }, [data, engine]);

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
      <ModalBody centered={loading}>
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

const getErrorMessage = (error: unknown): string | undefined => {
  return getIn(error, ["data", "message"]);
};

export default QueryPreviewModal;
