import { useId } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  Box,
  Button,
  FixedSizeIcon,
  Flex,
  MultiSelect,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";

import S from "./GroupMappings.module.css";
import type { MappingDraft } from "./use-mapping-editor";

type MappingEditorRowProps = {
  draft: MappingDraft;
  groupOptions: { value: string; label: string }[];
  nameLabel: string;
  namePlaceholder: string;
  submitLabel: string;
  canSubmit: boolean;
  nameError: string | null;
  isSubmitting: boolean;
  onChange: (draft: MappingDraft) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export function MappingEditorRow({
  draft,
  groupOptions,
  nameLabel,
  namePlaceholder,
  submitLabel,
  canSubmit,
  nameError,
  isSubmitting,
  onChange,
  onCancel,
  onSubmit,
}: MappingEditorRowProps) {
  const applicationName = useSelector(getApplicationName);
  const errorId = useId();

  // the editor is inside the page form, so Enter must not reach its submit button
  const handleNameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (canSubmit && !isSubmitting) {
        onSubmit();
      }
    }
    if (event.key === "Escape" && !isSubmitting) {
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
    <Box
      className={S.editorRow}
      bd="1px solid var(--mb-color-border-neutral)"
      bdrs="sm"
      p="sm"
    >
      <Stack gap="xs">
        {/* one wrapping row, buttons last, so a narrowing row sheds the buttons before the picker */}
        <Flex align="center" gap="lg" wrap="wrap">
          <TextInput
            flex={1}
            miw="10rem"
            aria-label={nameLabel}
            // Mantine owns aria-describedby on its inputs, so the reason is linked as the error message instead
            aria-errormessage={nameError == null ? undefined : errorId}
            placeholder={namePlaceholder}
            value={draft.name}
            error={nameError != null}
            onChange={(event) =>
              onChange({ ...draft, name: event.target.value })
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
            flex={1}
            miw="14rem"
            classNames={{ inputField: S.groupsSearchField }}
            aria-label={t`${applicationName} groups`}
            placeholder={
              draft.groupValues.length === 0
                ? t`Pick ${applicationName} group...`
                : undefined
            }
            data={groupOptions}
            value={draft.groupValues}
            onChange={(groupValues) => onChange({ ...draft, groupValues })}
            onKeyDown={handleGroupsKeyDown}
            searchable
          />
          <Flex align="center" gap="lg">
            <Button
              variant="subtle"
              disabled={isSubmitting}
              onClick={onCancel}
            >{t`Cancel`}</Button>
            <Button
              variant="filled"
              disabled={!canSubmit}
              loading={isSubmitting}
              onClick={onSubmit}
            >
              {submitLabel}
            </Button>
          </Flex>
        </Flex>
        {nameError != null && (
          <Text id={errorId} role="alert" c="error" fz="sm">
            {nameError}
          </Text>
        )}
      </Stack>
    </Box>
  );
}
