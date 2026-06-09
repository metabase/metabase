import { t } from "ttag";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import { ActionIcon, Box, Icon, Loader, Tooltip } from "metabase/ui";

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
      <Box className={S.editorWrapper}>
        <CodeEditor
          language="sql"
          lineNumbers={false}
          value={statement ?? ""}
          onChange={onChange}
          data-testid="sql-preview-editor"
        />
      </Box>
    );
  }

  const hasContent = Boolean(statement?.trim());

  return (
    <Box className={S.previewWrapper}>
      {hasContent ? (
        <Box className={S.preview} data-testid="sql-preview">
          <CodeEditor
            language="sql"
            lineNumbers={false}
            readOnly
            value={statement ?? ""}
          />
        </Box>
      ) : (
        <Box className={S.placeholderBox} data-testid="sql-preview">
          <span className={S.placeholder}>
            {t`Add columns to see the SQL preview.`}
          </span>
        </Box>
      )}
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
