import React, { useCallback, useMemo } from "react";
import { t } from "ttag";

import ModalContent from "metabase/components/ModalContent";

import WritebackForm, { WritebackFormProps } from "./WritebackForm";

interface WritebackModalFormProps extends WritebackFormProps {
  onClose: () => void;
}

function WritebackModalForm({
  table,
  row,
  type = row ? "update" : "insert",
  mode,
  onClose,
  onSubmit,
  ...props
}: WritebackModalFormProps) {
  const title = useMemo(() => {
    if (type === "update" && mode === "bulk") {
      return t`Update`;
    }
    const objectName = table.objectName();
    return type === "update" ? t`Edit ${objectName}` : t`New ${objectName}`;
  }, [table, type, mode]);

  const handleSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      await onSubmit(values);
      onClose();
    },
    [onSubmit, onClose],
  );

  return (
    <ModalContent title={title} onClose={onClose}>
      <WritebackForm
        table={table}
        row={row}
        type={type}
        mode={mode}
        onSubmit={handleSubmit}
        {...props}
      />
    </ModalContent>
  );
}

export default WritebackModalForm;
