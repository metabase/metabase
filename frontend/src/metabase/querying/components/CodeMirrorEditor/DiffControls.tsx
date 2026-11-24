import { createPortal } from "react-dom";
import { t } from "ttag";

import { Button, Flex, KeyboardShortcut } from "metabase/ui";

import type { DiffControlsShortcuts } from "./use-diff-controls";

type DiffControlsProps = {
  portalTarget: HTMLElement;
  shortcuts: DiffControlsShortcuts;
  onAcceptProposed: () => void;
  onRejectProposed: () => void;
};

export function DiffControls({
  portalTarget,
  shortcuts,
  onAcceptProposed,
  onRejectProposed,
}: DiffControlsProps) {
  return createPortal(
    <Flex gap="xs" py="xxs" px="xs" bg="background_page-secondary">
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
