import cx from "classnames";
import { t, jt } from "ttag";

import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/core/components/Button";
import ExternalLink from "metabase/core/components/ExternalLink";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";

type Props = {
  onClose: () => void;
};

function SQLSnippetsDocLink() {
  const href = useSelector(state =>
    getDocsUrl(state, { page: "questions/native-editor/sql-snippets" }),
  );
  return <ExternalLink href={href}>{t`SQL snippets`}</ExternalLink>;
}

function ReferencingQuestionsDocLink() {
  const href = useSelector(state =>
    getDocsUrl(state, {
      page: "questions/native-editor/referencing-saved-questions-in-queries",
      anchor: "referencing-models-and-saved-questions",
    }),
  );
  return (
    <ExternalLink
      href={href}
    >{t`reference the results of another saved question`}</ExternalLink>
  );
}

export function ImpossibleToCreateModelModal({ onClose }: Props) {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);

  return (
    <ModalContent
      title={t`Variables in models aren't supported yet`}
      onClose={onClose}
    >
      <p className={CS.textParagraph}>
        {showMetabaseLinks
          ? jt`To solve this, just remove the variables in this question and try again. (It's okay to use ${(
              <SQLSnippetsDocLink key="link-1" />
            )} or ${(
              <ReferencingQuestionsDocLink key="link-2" />
            )} in your query.)`
          : t`To solve this, just remove the variables in this question and try again. (It's okay to use SQL snippets or reference the results of another saved question in your query.)`}
      </p>
      <div className={cx(CS.flex, CS.justifyCenter, CS.py1)}>
        <Button primary onClick={onClose}>{t`Okay`}</Button>
      </div>
    </ModalContent>
  );
}
