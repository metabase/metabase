import { t } from "ttag";

import { useGetNativeDatasetQuery } from "metabase/api";
import { formatNativeQuery } from "metabase/lib/engine";
import { getResponseErrorMessage } from "metabase/lib/errors";
import { useSelector } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import {
  getQuestion,
  getNextRunParameters,
} from "metabase/query_builder/selectors";
import { getLearnUrl } from "metabase/selectors/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import * as Lib from "metabase-lib";

import { NativeQueryPreview } from "../NativeQueryPreview";

import { ModalExternalLink } from "./PreviewQueryModal.styled";

interface PreviewQueryModalProps {
  onClose?: () => void;
}

export const PreviewQueryModal = ({
  onClose,
}: PreviewQueryModalProps): JSX.Element => {
  const question = checkNotNull(useSelector(getQuestion));
  const sourceQuery = question.query();
  const parameters = useSelector(getNextRunParameters);
  const payload = {
    ...Lib.toLegacyQuery(sourceQuery),
    parameters,
    pretty: false,
  };
  const { data, error, isFetching } = useGetNativeDatasetQuery(payload);
  const learnUrl = getLearnUrl("debugging-sql/sql-syntax");
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);

  const engine = question.database()?.engine;
  const formattedQuery = formatNativeQuery(data?.query, engine);
  const formattedError = error ? getResponseErrorMessage(error) : undefined;

  return (
    <NativeQueryPreview
      title={t`Query preview`}
      query={formattedQuery}
      error={formattedError}
      isLoading={isFetching}
      onClose={onClose}
    >
      {formattedError && showMetabaseLinks && (
        <ModalExternalLink href={learnUrl}>
          {t`Learn how to debug SQL errors`}
        </ModalExternalLink>
      )}
    </NativeQueryPreview>
  );
};
