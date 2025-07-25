import cx from "classnames";
import { t } from "ttag";

import { Button, Group, Title } from "metabase/ui";

import S from "./TransformHeader.module.css";

type TransformHeaderProps = {
  name?: string;
  isNative: boolean;
  canSave: boolean;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
};

export function TransformHeader({
  name,
  isNative,
  canSave,
  isSaving,
  onSave,
  onCancel,
}: TransformHeaderProps) {
  return (
    <Group
      className={cx(S.header, {
        [S.withBorder]: !isNative,
      })}
      px="md"
      py="sm"
      pos="sticky"
      top={0}
      bg="bg-white"
    >
      <Title flex={1} order={4} c={name ? "text-dark" : "text-medium"}>
        {name ?? t`New transform`}
      </Title>
      <Button
        variant="filled"
        loading={isSaving}
        disabled={!canSave}
        onClick={onSave}
      >
        {t`Save`}
      </Button>
      <Button onClick={onCancel}>{t`Cancel`}</Button>
    </Group>
  );
}
