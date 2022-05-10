import React from "react";
import { t } from "ttag";

import ModalContent from "metabase/components/ModalContent";

import WritebackForm, { WritebackFormProps } from "./WritebackForm";

interface WritebackModalFormProps extends WritebackFormProps {
  onClose: () => void;
}

function WritebackModalForm({
  table,
  onClose,
  ...props
}: WritebackModalFormProps) {
  const title = t`New ${table.objectName()}`;
  return (
    <ModalContent title={title} onClose={onClose}>
      <WritebackForm table={table} {...props} />
    </ModalContent>
  );
}

export default WritebackModalForm;
