import { type ChangeEvent } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { Button, Group, Icon, Tooltip } from "metabase/ui";

import S from "./SlidesHeader.module.css";

interface SlidesHeaderProps {
  name: string;
  onNameChange: (name: string) => void;
  onPresent: () => void;
  onGenerate: () => void;
  canPresent: boolean;
  saveStatus: "saved" | "saving" | "dirty" | "error";
}

const saveLabel: Record<SlidesHeaderProps["saveStatus"], string> = {
  saved: t`Saved`,
  saving: t`Saving…`,
  dirty: t`Unsaved changes`,
  error: t`Save failed`,
};

export const SlidesHeader = ({
  name,
  onNameChange,
  onPresent,
  onGenerate,
  canPresent,
  saveStatus,
}: SlidesHeaderProps) => {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) =>
    onNameChange(e.target.value);

  return (
    <header className={S.header}>
      <Tooltip label={t`Back`}>
        <Link to="/" className={S.backLink} aria-label={t`Back`}>
          <Icon name="chevronleft" />
        </Link>
      </Tooltip>
      <input
        className={S.titleInput}
        value={name}
        onChange={handleChange}
        placeholder={t`Untitled slides`}
        aria-label={t`Deck title`}
      />
      <span className={S.saveIndicator}>{saveLabel[saveStatus]}</span>
      <Group gap="xs" className={S.actions}>
        <Button
          variant="subtle"
          leftSection={<Icon name="sparkles" />}
          onClick={onGenerate}
        >
          {t`Generate`}
        </Button>
        <Button
          variant="filled"
          leftSection={<Icon name="play" />}
          onClick={onPresent}
          disabled={!canPresent}
        >
          {t`Present`}
        </Button>
      </Group>
    </header>
  );
};
