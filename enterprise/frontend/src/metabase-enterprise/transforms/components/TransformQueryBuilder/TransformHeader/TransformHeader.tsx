import { t } from "ttag";

import Button from "metabase/common/components/Button";
import EditBar from "metabase/common/components/EditBar";

type TransformHeaderProps = {
  name?: string;
  canSave: boolean;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
};

export function TransformHeader({
  name,
  canSave,
  isSaving,
  onSave,
  onCancel,
}: TransformHeaderProps) {
  const saveButton = (
    <Button
      key="save"
      onClick={onSave}
      primary
      small
      disabled={!canSave || isSaving}
    >
      {isSaving ? t`Saving changes` : t`Save changes`}
    </Button>
  );

  const cancelButton = (
    <Button key="cancel" small onClick={onCancel}>{t`Cancel`}</Button>
  );

  return (
    <EditBar
      title={name ?? t`You’re creating a new transform`}
      admin
      buttons={[saveButton, cancelButton]}
    />
  );
}
