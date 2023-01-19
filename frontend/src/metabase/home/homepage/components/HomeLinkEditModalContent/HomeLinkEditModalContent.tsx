import React from "react";

import { t } from "ttag";
import ModalContent from "metabase/components/ModalContent";

import { Link, NewLink } from "metabase-types/api";
import ExternalLinkForm from "../ExternalLinkForm/ExternalLinkForm";

interface HomeLinkEditModalContentProps {
  isNew?: boolean;
  link?: Link;
  onSubmit: (data: NewLink) => void;
  onClose: () => void;
}

const HomeLinkEditModalContent = ({
  isNew,
  link,
  onSubmit,
  onClose,
}: HomeLinkEditModalContentProps) => {
  const title = isNew ? t`Add a quick link for your team` : t`Edit link`;

  return (
    <ModalContent title={title}>
      <ExternalLinkForm
        isNew={isNew}
        onSubmit={onSubmit}
        initialValues={link}
      />
    </ModalContent>
  );
};

export default HomeLinkEditModalContent;
