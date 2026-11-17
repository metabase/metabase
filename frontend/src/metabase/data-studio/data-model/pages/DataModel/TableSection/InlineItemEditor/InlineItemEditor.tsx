import { useDisclosure } from "@mantine/hooks";
import { type KeyboardEvent, type ReactNode, useEffect, useRef } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { EditableText } from "metabase/common/components/EditableText";
import { ForwardRefLink } from "metabase/common/components/Link";
import { ActionIcon, Box, Button, Group, Icon, Menu } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { CLAUSE_PILL_ATTRIBUTE } from "../ClausePills";

/** A row's name, edited in place; it reads as text until it's clicked */
export function ItemNameInput({
  value,
  placeholder,
  isMuted,
  autoFocus,
  onChange,
}: {
  value: string;
  placeholder: string;
  isMuted?: boolean;
  autoFocus?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <EditableText
      initialValue={value}
      placeholder={placeholder}
      isOptional
      autoFocus={autoFocus}
      c={isMuted ? "text-secondary" : undefined}
      miw={0}
      // One line, like the names in the rows around it
      style={{ WebkitLineClamp: 1 }}
      aria-label={t`Name`}
      onContentChange={onChange}
    />
  );
}

/**
 * A row's definition: Enter on a clause saves the row, and after a picker
 * closes on a pick, focus goes to the last clause rather than the page, so
 * Enter saves and Tab leads on to Save
 */
export function ItemDefinition({
  query,
  canSave,
  onSave,
  children,
}: {
  query: Lib.Query;
  canSave: boolean;
  onSave: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const previousQuery = usePrevious(query);

  useEffect(() => {
    if (previousQuery == null || previousQuery === query) {
      return;
    }
    // The picker's dropdown unmounts after this render; wait until it has
    const timeout = setTimeout(() => {
      const { activeElement } = document;
      const isFocusLost =
        activeElement == null ||
        activeElement === document.body ||
        !activeElement.isConnected;
      if (isFocusLost && ref.current) {
        const pills = ref.current.querySelectorAll<HTMLElement>(
          `[${CLAUSE_PILL_ATTRIBUTE}]`,
        );
        pills[pills.length - 1]?.focus();
      }
    });
    return () => clearTimeout(timeout);
  }, [previousQuery, query]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const { target } = event;
    if (
      event.key !== "Enter" ||
      event.defaultPrevented ||
      !canSave ||
      // Pickers render in portals; their Enter isn't the row's
      !(target instanceof Node && event.currentTarget.contains(target)) ||
      // Buttons, like "Add filter", keep Enter for opening their picker
      target instanceof HTMLButtonElement
    ) {
      return;
    }
    event.preventDefault();
    onSave();
  };

  return (
    <Box ref={ref} display="contents" onKeyDown={handleKeyDown}>
      {children}
    </Box>
  );
}

/** Cancel and Save for a row with unsaved edits */
export function InlineEditActions({
  canSave,
  isSaving,
  onSave,
  onCancel,
}: {
  canSave: boolean;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <Group gap="sm" wrap="nowrap" flex="0 0 auto">
      <Button size="sm" disabled={isSaving} onClick={onCancel}>
        {t`Cancel`}
      </Button>
      <Button
        size="sm"
        variant="filled"
        disabled={!canSave}
        loading={isSaving}
        onClick={onSave}
      >
        {t`Save`}
      </Button>
    </Group>
  );
}

/** What the ⋯ menu's Remove says, for a segment or a measure */
export type ItemRemoveCopy = {
  label: string;
  title: string;
  message: string;
};

/** A saved row's ⋯ menu: its own page, and removing it after a confirmation */
export function ItemRowMenu({
  detailsUrl,
  removeCopy,
  onRemove,
}: {
  detailsUrl: string;
  removeCopy: ItemRemoveCopy;
  onRemove: () => void;
}) {
  const [isConfirmOpen, { open: openConfirm, close: closeConfirm }] =
    useDisclosure();

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon variant="subtle" aria-label={t`More actions`}>
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            component={ForwardRefLink}
            to={detailsUrl}
            leftSection={<Icon name="eye" />}
          >
            {t`View details`}
          </Menu.Item>
          <Menu.Item
            c="feedback-negative"
            leftSection={<Icon name="trash" />}
            onClick={openConfirm}
          >
            {removeCopy.label}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <ConfirmModal
        title={removeCopy.title}
        message={removeCopy.message}
        opened={isConfirmOpen}
        confirmButtonText={t`Remove`}
        onClose={closeConfirm}
        onConfirm={() => {
          closeConfirm();
          onRemove();
        }}
      />
    </>
  );
}
