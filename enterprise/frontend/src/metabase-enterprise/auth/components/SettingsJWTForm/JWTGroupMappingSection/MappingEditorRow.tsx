import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  Button,
  FixedSizeIcon,
  Flex,
  MultiSelect,
  TextInput,
} from "metabase/ui";

import S from "./JWTGroupMappingSection.module.css";

export type EditorState = {
  jwtGroupName: string;
  // MultiSelect values, so group ids as strings
  groupValues: string[];
  // set while an existing mapping is being edited
  originalJwtGroupName: string | null;
};

export function MappingEditorRow({
  editor,
  groupOptions,
  submitLabel,
  canSubmit,
  isDuplicateName,
  isSubmitting,
  onChange,
  onCancel,
  onSubmit,
}: {
  editor: EditorState;
  groupOptions: { value: string; label: string }[];
  submitLabel: string;
  canSubmit: boolean;
  isDuplicateName: boolean;
  isSubmitting: boolean;
  onChange: (editor: EditorState) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const applicationName = useSelector(getApplicationName);

  /** The editor is inside the page form, so Enter must not reach its submit button */
  const handleNameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (canSubmit && !isSubmitting) {
        onSubmit();
      }
    }
    if (event.key === "Escape") {
      onCancel();
    }
  };

  const handleGroupsKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
    }
  };

  return (
    <Flex
      className={S.editorRow}
      bd="1px solid var(--mb-color-border-neutral)"
      bdrs="sm"
      p="sm"
      align="center"
      gap="lg"
      wrap="wrap"
    >
      <TextInput
        flex={1}
        miw="10rem"
        aria-label={t`JWT group name`}
        placeholder={t`Enter JWT group...`}
        value={editor.jwtGroupName}
        error={
          isDuplicateName ? t`A mapping for this group already exists` : null
        }
        onChange={(event) =>
          onChange({ ...editor, jwtGroupName: event.target.value })
        }
        onKeyDown={handleNameKeyDown}
        autoFocus
      />
      <FixedSizeIcon
        aria-hidden
        name="arrow_right"
        c="text-secondary"
        className={S.editorArrow}
      />
      <MultiSelect
        flex={2}
        miw="14rem"
        classNames={{ inputField: S.groupsSearchField }}
        aria-label={t`${applicationName} groups`}
        placeholder={
          editor.groupValues.length === 0
            ? t`Pick ${applicationName} group...`
            : undefined
        }
        data={groupOptions}
        value={editor.groupValues}
        onChange={(groupValues) => onChange({ ...editor, groupValues })}
        onKeyDown={handleGroupsKeyDown}
        searchable
      />
      <Button variant="subtle" onClick={onCancel}>{t`Cancel`}</Button>
      <Button
        variant="filled"
        disabled={!canSubmit}
        loading={isSubmitting}
        onClick={onSubmit}
      >
        {submitLabel}
      </Button>
    </Flex>
  );
}
