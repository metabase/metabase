import { useClipboard } from "@mantine/hooks";
import { useCallback } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  type ActionIconProps,
  Icon,
  Text,
  Tooltip,
} from "metabase/ui";
import { isPlainKey } from "metabase/utils/keyboard";

type Props = ActionIconProps & {
  url: string;
  onCopy?: () => void;
};

export const AnchorLinkButton = ({ url, onCopy, ...props }: Props) => {
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
      <ActionIcon
        {...props}
        aria-label={t`Copy link`}
        variant="subtle"
        size="sm"
        onClick={handleCopy}
        onKeyDown={handleKeyDown}
      >
        <Icon name="link" />
      </ActionIcon>
    </Tooltip>
  );
};
