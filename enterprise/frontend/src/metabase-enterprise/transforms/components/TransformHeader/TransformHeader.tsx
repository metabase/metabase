import { t } from "ttag";

import { Button, Group } from "metabase/ui";

import S from "./TransformHeader.module.css";

type TransformHeaderProps = {
  onSave: () => void;
  onCancel: () => void;
};

export function TransformHeader({ onSave, onCancel }: TransformHeaderProps) {
  return (
    <Group className={S.header} px="md" py="sm" justify="end">
      <Button variant="filled" onClick={onSave}>{t`Save`}</Button>
      <Button onClick={onCancel}>{t`Cancel`}</Button>
    </Group>
  );
}
