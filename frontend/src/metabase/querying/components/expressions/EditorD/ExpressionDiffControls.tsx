import { createPortal } from "react-dom";
import { t } from "ttag";

import { Button, Flex, KeyboardShortcut, Text, TextInput } from "metabase/ui";

import type { DiffControlsShortcuts } from "../../CodeMirrorEditor/use-diff-controls";

const NAME_INPUT_ID = "expression-diff-name";

type ExpressionDiffControlsProps = {
  portalTarget: HTMLElement;
  shortcuts: DiffControlsShortcuts;
  /** A suggested column name. No name field when it is absent. */
  name?: string;
  onNameChange: (name: string) => void;
  onAcceptProposed: () => void;
  onRejectProposed: () => void;
};

export function ExpressionDiffControls({
  portalTarget,
  shortcuts,
  name,
  onNameChange,
  onAcceptProposed,
  onRejectProposed,
}: ExpressionDiffControlsProps) {
  return createPortal(
    <Flex
      gap="xs"
      py="xxs"
      px="xs"
      align="center"
      bg="background_page-secondary"
      wrap="wrap"
      // The editor content uses a monospace font.
      ff="var(--mb-default-font-family)"
    >
      {name != null && (
        <Text
          size="sm"
          c="text-secondary"
          component="label"
          htmlFor={NAME_INPUT_ID}
        >
          {t`Name`}
        </Text>
      )}
      {name != null && (
        <TextInput
          id={NAME_INPUT_ID}
          size="xs"
          w="14rem"
          aria-label={t`Column name`}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onAcceptProposed();
            }
          }}
        />
      )}
      <Button
        data-testid="accept-proposed-changes-button"
        variant="default"
        size="sm"
        onClick={onAcceptProposed}
        rightSection={<KeyboardShortcut shortcut={shortcuts.accept.hint} />}
      >
        {t`Accept`}
      </Button>
      <Button
        data-testid="reject-proposed-changes-button"
        variant="default"
        size="sm"
        onClick={onRejectProposed}
        rightSection={<KeyboardShortcut shortcut={shortcuts.reject.hint} />}
      >
        {t`Reject`}
      </Button>
    </Flex>,
    portalTarget,
  );
}
