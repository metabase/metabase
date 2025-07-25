import { t } from "ttag";

import { Button, Group } from "metabase/ui";

import S from "./TransformHeader.module.css";

type TransformHeaderProps = {
  isSaving?: boolean;
  onSave: () => void;
  onCancel: () => void;
};

export function TransformHeader({
  isSaving,
  onSave,
  onCancel,
}: TransformHeaderProps) {
  return (
    <Group
      className={S.header}
      px="md"
      py="sm"
      justify="end"
      pos="sticky"
      top={0}
      bg="bg-white"
    >
      <Button variant="filled" loading={isSaving} onClick={onSave}>
        {t`Save`}
      </Button>
      <Button onClick={onCancel}>{t`Cancel`}</Button>
    </Group>
  );
}
