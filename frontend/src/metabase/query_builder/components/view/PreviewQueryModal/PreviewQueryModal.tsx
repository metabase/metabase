import { t } from "ttag";
import { useCallback } from "react";
import MetabaseSettings from "metabase/lib/settings";
import {
  getNativeQueryFn,
  getQuestion,
} from "metabase/query_builder/selectors";
import { checkNotNull } from "metabase/lib/types";
import { useSelector } from "metabase/lib/redux";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import NativeQueryModal, { useNativeQuery } from "../NativeQueryModal";
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
    <NativeQueryModal
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
    </NativeQueryModal>
  );
};
