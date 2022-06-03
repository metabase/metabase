import React, { useCallback } from "react";
import { t } from "ttag";

import ModalContent from "metabase/components/ModalContent";

import WritebackForm, { WritebackFormProps } from "./WritebackForm";

interface WritebackModalFormProps extends WritebackFormProps {
  onClose: () => void;
}

function WritebackModalForm({
  table,
  onClose,
  onSubmit,
  ...props
}: WritebackModalFormProps) {
  const title = t`New ${table.objectName()}`;

  const handleSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      await onSubmit(values);
      onClose();
    },
    [onSubmit, onClose],
  );

  return (
    <ModalContent title={title} onClose={onClose}>
      <WritebackForm table={table} onSubmit={handleSubmit} {...props} />
    </ModalContent>
  );
}

export default WritebackModalForm;
