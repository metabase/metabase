import { useClipboard } from "@mantine/hooks";
import type { ComponentPropsWithoutRef, ElementType } from "react";
import { useCallback } from "react";
import { t } from "ttag";

import { isPlainKey } from "metabase/common/utils/keyboard";
import { Button, type ButtonProps, Icon, Text, Tooltip } from "metabase/ui";

type Props<C extends ElementType = "button"> = ButtonProps & {
  url: string;
  onCopy?: () => void;
  component?: C;
} & Omit<ComponentPropsWithoutRef<C>, keyof ButtonProps | "component">;

export const AnchorLinkButton = <C extends ElementType = "button">({
  url,
  onCopy,
  ...props
}: Props<C>) => {
  const clipboard = useClipboard({ timeout: 2000 });

  const handleCopy = useCallback(() => {
    clipboard.copy(url);
    onCopy?.();
  }, [clipboard, url, onCopy]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (isPlainKey(e, "Enter") || isPlainKey(e, " ")) {
        e.preventDefault();
        handleCopy();
      }
    },
    [handleCopy],
  );

  return (
    <Tooltip
      label={<Text fw={700} c="inherit">{t`Copied!`}</Text>}
      opened={clipboard.copied}
    >
      <Button
        {...(props as ButtonProps)}
        aria-label={t`Copy link`}
        bd={0}
        leftSection={<Icon name="link" />}
        px="sm"
        size="xs"
        onClick={handleCopy}
        onKeyDown={handleKeyDown}
      />
    </Tooltip>
  );
};
