import { useCallback } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import { checkNotNull } from "metabase/lib/types";
import {
  getNativeQueryFn,
  getQuestion,
} from "metabase/query_builder/selectors";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";

import { NativeQueryPreview, useNativeQuery } from "../NativeQueryPreview";

import { ModalExternalLink } from "./PreviewQueryModal.styled";

interface PreviewQueryModalProps {
  onClose?: () => void;
}

export const PreviewQueryModal = ({
  onClose,
}: PreviewQueryModalProps): JSX.Element => {
  const question = checkNotNull(useSelector(getQuestion));
  const onLoadQuery = useSelector(getNativeQueryFn);
  const handleLoadQuery = useCallback(
    () => onLoadQuery({ pretty: false }),
    [onLoadQuery],
  );
  const { query, error, isLoading } = useNativeQuery(question, handleLoadQuery);
  const learnUrl = MetabaseSettings.learnUrl("debugging-sql/sql-syntax");
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);

  return (
    <NativeQueryPreview
      title={t`Query preview`}
      query={query}
      error={error}
      isLoading={isLoading}
      onClose={onClose}
    >
      {error && showMetabaseLinks && (
        <ModalExternalLink href={learnUrl}>
          {t`Learn how to debug SQL errors`}
        </ModalExternalLink>
      )}
    </NativeQueryPreview>
  );
};
