import { t } from "ttag";

import { ActionIcon, Box, Icon, Loader, Textarea, Tooltip } from "metabase/ui";

import S from "./SqlPreview.module.css";

interface Props {
  statement: string | null;
  isEditing: boolean;
  isLoading?: boolean;
  onEditStart: () => void;
  onChange: (value: string) => void;
}

export function SqlPreview({
  statement,
  isEditing,
  isLoading,
  onEditStart,
  onChange,
}: Props) {
  if (isEditing) {
    return (
      <Textarea
        autosize
        minRows={3}
        value={statement ?? ""}
        classNames={{ input: S.editor }}
        placeholder={t`CREATE INDEX ...`}
        aria-label={t`Index SQL statement`}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    );
  }

  return (
    <Box className={S.previewWrapper}>
      <Box className={S.preview} data-testid="sql-preview">
        {statement?.trim() ? (
          statement
        ) : (
          <span className={S.placeholder}>
            {t`Add columns to see the SQL preview.`}
          </span>
        )}
      </Box>
      <Box className={S.editButton}>
        {isLoading ? (
          <Loader size="xs" />
        ) : (
          <Tooltip label={t`Edit SQL`}>
            <ActionIcon
              variant="subtle"
              size="sm"
              aria-label={t`Edit SQL`}
              onClick={onEditStart}
            >
              <Icon name="pencil" size={14} />
            </ActionIcon>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}
