import { t } from "ttag";

import Button from "metabase/common/components/Button";
import EditBar from "metabase/common/components/EditBar";

type EditorHeaderProps = {
  canSave: boolean;
  isNew: boolean;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
  onToggleNativeQueryPreview?: () => void;
  isShowingNativeQueryPreview?: boolean;
};

export function EditorHeader({
  canSave,
  isNew,
  isSaving,
  onSave,
  onCancel,
  isShowingNativeQueryPreview,
  onToggleNativeQueryPreview,
}: EditorHeaderProps) {
  return (
    <EditBar
      title={getTitle(isNew)}
      admin
      buttons={[
        onToggleNativeQueryPreview ? (
          <Button
            key="view-sql"
            small
            onClick={onToggleNativeQueryPreview}
            icon="sql"
          >
            {isShowingNativeQueryPreview ? t`Hide SQL` : t`View SQL`}
          </Button>
        ) : null,
        <Button key="cancel" small onClick={onCancel}>{t`Cancel`}</Button>,
        <Button
          key="save"
          onClick={onSave}
          primary
          small
          disabled={!canSave || isSaving}
        >
          {getSaveButtonLabel(isNew, isSaving)}
        </Button>,
      ]}
    />
  );
}

function getTitle(isNew: boolean) {
  if (isNew) {
    return t`You’re creating a new transform`;
  } else {
    return t`You’re editing a transform`;
  }
}

function getSaveButtonLabel(isNew: boolean, isSaving: boolean) {
  if (isSaving) {
    return isNew ? t`Saving` : t`Saving changes`;
  } else {
    return isNew ? t`Save` : t`Save changes`;
  }
}
