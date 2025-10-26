import { t } from "ttag";

import { Button, Group } from "metabase/ui";

type SaveSectionProps = {
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
};

export function SaveSection({ isSaving, onSave, onCancel }: SaveSectionProps) {
  return (
    <Group>
      <Button onClick={onCancel}>{t`Cancel`}</Button>
      <Button variant="filled" disabled={isSaving} onClick={onSave}>
        {t`Save`}
      </Button>
    </Group>
  );
}
