import { t } from "ttag";

import Button from "metabase/common/components/Button";
import EditBar from "metabase/common/components/EditBar";
import type { TransformInfo } from "metabase-enterprise/transforms/types";

type EditorHeaderProps = {
  transform: TransformInfo;
  onCreate: () => void;
  onSave: () => void;
  onCancel: () => void;
};

export function EditorHeader({
  transform,
  onCreate,
  onSave,
  onCancel,
}: EditorHeaderProps) {
  return (
    <EditBar
      title={transform.name ?? t`New table`}
      buttons={[
        <Button key="cancel" small onClick={onCancel}>{t`Cancel`}</Button>,
        transform.id != null ? (
          <Button key="save" primary small onClick={onSave}>
            {t`Save changes`}
          </Button>
        ) : (
          <Button key="create" primary small onClick={onCreate}>
            {t`Save`}
          </Button>
        ),
      ]}
    />
  );
}
