import React from "react";
import { t, jt } from "ttag";

import ExternalLink from "metabase/components/ExternalLink";
import ModalContent from "metabase/components/ModalContent";

import MetabaseSettings from "metabase/lib/settings";

type Props = {
  onClose: () => void;
};

function SQLSnippetsDocLink() {
  const href = MetabaseSettings.docsUrl("users-guide/sql-snippets");
  return <ExternalLink href={href}>{t`SQL snippets`}</ExternalLink>;
}

function ReferencingQuestionsDocLink() {
  const href = MetabaseSettings.docsUrl("users-guide/sql-snippets");
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
      <p>{t`This saved question has some variables in it that models can't handle quite yet. To solve this, remove your variables, create your model, then set up your column metadata to tell Metabase which field each one corresponds to.`}</p>
      <p>{jt`Note: it's okay to use ${(
        <SQLSnippetsDocLink key="link-1" />
      )} or ${(
        <ReferencingQuestionsDocLink key="link-2" />
      )} in your query.`}</p>
    </ModalContent>
  );
}
