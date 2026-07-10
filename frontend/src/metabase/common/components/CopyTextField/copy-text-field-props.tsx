import type { MouseEvent } from "react";
import { t } from "ttag";

import { ActionIcon, CopyButton, Icon, Tooltip } from "metabase/ui";

type CopyableElement = HTMLInputElement | HTMLTextAreaElement;

export type CopyTextFieldOptions<E extends CopyableElement> = {
  value: string;
  readOnly?: boolean;
  onClick?: (event: MouseEvent<E>) => void;
  onCopied?: () => void;
};

const DEFAULT_READ_ONLY = true;

export function getCopyTextFieldProps<E extends CopyableElement>({
  value,
  readOnly,
  onClick,
  onCopied,
}: CopyTextFieldOptions<E>) {
  const isReadOnly = readOnly ?? DEFAULT_READ_ONLY;

  return {
    readOnly: isReadOnly,
    onClick: (event: MouseEvent<E>) => {
      if (isReadOnly) {
        event.currentTarget.setSelectionRange(
          0,
          event.currentTarget.value.length,
        );
      }
      onClick?.(event);
    },
    rightSectionPointerEvents: "all" as const,
    rightSection: value ? (
      <CopyButton value={value} timeout={2000}>
        {({ copied, copy }) => (
          <Tooltip label={t`Copied!`} opened={copied}>
            <ActionIcon
              variant="subtle"
              aria-label={t`Copy`}
              data-testid="copy-button"
              onClick={() => {
                copy();
                onCopied?.();
              }}
            >
              <Icon name="copy" />
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    ) : undefined,
  };
}
