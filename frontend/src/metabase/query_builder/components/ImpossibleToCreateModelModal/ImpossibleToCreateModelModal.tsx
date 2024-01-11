import { t, jt } from "ttag";

import Button from "metabase/core/components/Button";
import ExternalLink from "metabase/core/components/ExternalLink";
import ModalContent from "metabase/components/ModalContent";

import MetabaseSettings from "metabase/lib/settings";
import { useSelector } from "metabase/lib/redux";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";

const sqlSnippetLinkText = t`SQL snippets`;
const referenceLinkText = t`reference the results of another saved question`;

type Props = {
  onClose: () => void;
};

function SQLSnippetsDocLink() {
  const href = MetabaseSettings.docsUrl("questions/native-editor/sql-snippets");
  return <ExternalLink href={href}>{sqlSnippetLinkText}</ExternalLink>;
}

function ReferencingQuestionsDocLink() {
  const href = MetabaseSettings.docsUrl("questions/native-editor/sql-snippets");
  return <ExternalLink href={href}>{referenceLinkText}</ExternalLink>;
}

export function ImpossibleToCreateModelModal({ onClose }: Props) {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);

  return (
    <ModalContent
      title={t`Variables in models aren't supported yet`}
      onClose={onClose}
    >
      <p className="text-paragraph">
        {showMetabaseLinks
          ? jt`To solve this, just remove the variables in this question and try again. (It's okay to use ${(
              <SQLSnippetsDocLink key="link-1" />
            )} or ${(
              <ReferencingQuestionsDocLink key="link-2" />
            )} in your query.)`
          : t`To solve this, just remove the variables in this question and try again. (It's okay to use SQL snippets or reference the results of another saved question in your query.)`}
      </p>
      <div className="flex justify-center py1">
        <Button primary onClick={onClose}>{t`Okay`}</Button>
      </div>
    </ModalContent>
  );
}
