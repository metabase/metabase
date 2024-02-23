import { connect } from "react-redux";
import { t } from "ttag";

import MetabaseSettings from "metabase/lib/settings";
import {
  getNativeQueryFn,
  getQuestion,
} from "metabase/query_builder/selectors";
import type Question from "metabase-lib/Question";
import type { NativeQueryForm } from "metabase-types/api";
import type { State } from "metabase-types/store";

import NativeQueryModal, { useNativeQuery } from "../NativeQueryModal";

import { ModalExternalLink } from "./PreviewQueryModal.styled";

interface PreviewQueryModalProps {
  question: Question;
  onLoadQuery: ({ pretty }: { pretty?: boolean }) => Promise<NativeQueryForm>;
  onClose?: () => void;
}

const PreviewQueryModal = ({
  question,
  onLoadQuery,
  onClose,
}: PreviewQueryModalProps): JSX.Element => {
  const { query, error, isLoading } = useNativeQuery(question, () =>
    onLoadQuery({ pretty: false }),
  );
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
        <ModalExternalLink href={learnUrl}>
          {t`Learn how to debug SQL errors`}
        </ModalExternalLink>
      )}
    </NativeQueryModal>
  );
};

const mapStateToProps = (state: State) => ({
  // FIXME: remove the non-null assertion operator
  question: getQuestion(state)!,
  onLoadQuery: getNativeQueryFn(state),
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(PreviewQueryModal);
