import React from "react";
import { t, jt } from "ttag";

import { Button } from "metabase/core/components/Button";
import { ExternalLink } from "metabase/core/components/ExternalLink";
import ModalContent from "metabase/components/ModalContent";

import MetabaseSettings from "metabase/lib/settings";

type Props = {
  onClose: () => void;
};

function SQLSnippetsDocLink() {
  const href = MetabaseSettings.docsUrl("questions/native-editor/sql-snippets");
  return <ExternalLink href={href}>{t`SQL snippets`}</ExternalLink>;
}

function ReferencingQuestionsDocLink() {
  const href = MetabaseSettings.docsUrl("questions/native-editor/sql-snippets");
  return (
    <ExternalLink
      href={href}
    >{t`reference the results of another saved question`}</ExternalLink>
  );
}

export function ImpossibleToCreateModelModal({ onClose }: Props) {
  return (
    <ModalContent
      title={t`Variables in models aren't supported yet`}
      onClose={onClose}
    >
      <p className="text-paragraph">{jt`To solve this, just remove the variables in this question and try again. (It's okay to use ${(
        <SQLSnippetsDocLink key="link-1" />
      )} or ${(
        <ReferencingQuestionsDocLink key="link-2" />
      )} in your query.)`}</p>
      <div className="flex justify-center py1">
        <Button primary onClick={onClose}>{t`Okay`}</Button>
      </div>
    </ModalContent>
  );
}
