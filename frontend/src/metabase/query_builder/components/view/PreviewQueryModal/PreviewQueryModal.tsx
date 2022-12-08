import React from "react";
import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import ExternalLink from "metabase/core/components/ExternalLink";
import Question from "metabase-lib/Question";
import NativeQueryModal, { useNativeQuery } from "../NativeQueryModal";

interface PreviewQueryModalProps {
  question: Question;
  onClose?: () => void;
}

const PreviewQueryModal = ({
  question,
  onClose,
}: PreviewQueryModalProps): JSX.Element => {
  const { query, error, isLoading } = useNativeQuery(question);
  const learnUrl = MetabaseSettings.learnUrl("debugging-sql/sql-syntax");

  return (
    <NativeQueryModal
      title={t`Query preview`}
      query={query}
      error={error}
      isLoading={isLoading}
      onClose={onClose}
    >
      {error && (
        <ExternalLink href={learnUrl}>
          {t`Learn how to debug SQL errors`}
        </ExternalLink>
      )}
    </NativeQueryModal>
  );
};

export default PreviewQueryModal;
