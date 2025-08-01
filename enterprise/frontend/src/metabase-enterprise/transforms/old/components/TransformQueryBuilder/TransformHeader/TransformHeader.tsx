import { t } from "ttag";

import Button from "metabase/common/components/Button";
import EditBar from "metabase/common/components/EditBar";

type TransformHeaderProps = {
  name?: string;
  canSave: boolean;
  isNew: boolean;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
};

export function TransformHeader({
  name,
  canSave,
  isNew,
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
      {getSaveButtonLabel(isNew, isSaving)}
    </Button>
  );

  const cancelButton = (
    <Button key="cancel" small onClick={onCancel}>{t`Cancel`}</Button>
  );

  return (
    <EditBar
      title={getTitle(name, isNew)}
      admin
      buttons={[saveButton, cancelButton]}
    />
  );
}

function getTitle(name: string | undefined, isNew: boolean) {
  if (isNew) {
    return t`You’re creating a new transform`;
  } else {
    return name ?? t`You’re editing a transform`;
  }
}

function getSaveButtonLabel(isNew: boolean, isSaving: boolean) {
  if (isSaving) {
    return isNew ? t`Saving` : t`Saving changes`;
  } else {
    return isNew ? t`Save` : t`Save changes`;
  }
}
