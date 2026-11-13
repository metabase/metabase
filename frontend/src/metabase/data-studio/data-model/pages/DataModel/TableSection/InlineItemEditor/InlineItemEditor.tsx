import { t } from "ttag";

import { EditableText } from "metabase/common/components/EditableText";
import { ForwardRefLink } from "metabase/common/components/Link";
import { ActionIcon, Button, Group, Icon, Menu } from "metabase/ui";

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

/** A saved row's ⋯ menu, leading to the item's own page */
export function ItemRowMenu({ detailsUrl }: { detailsUrl: string }) {
  return (
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
      </Menu.Dropdown>
    </Menu>
  );
}
