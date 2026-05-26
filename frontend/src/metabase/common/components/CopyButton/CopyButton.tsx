import { useClipboard } from "@mantine/hooks";
import cx from "classnames";
import { useCallback } from "react";
import { t } from "ttag";

import { isPlainKey } from "metabase/common/utils/keyboard";
import Styles from "metabase/css/core/index.css";
import { Icon, Text, Tooltip } from "metabase/ui";

import CopyButtonStyles from "./CopyButton.module.css";

export const COPY_BUTTON_ICON = (
  <Icon className={CopyButtonStyles.CopyButton} tabIndex={0} name="copy" />
);

type CopyButtonProps = {
  value: string;
  onCopy?: () => void;
  className?: string;
  style?: object;
  "aria-label"?: string;
  target?: React.ReactNode;
};

export const CopyButton = ({
  value,
  onCopy,
  className = cx(Styles.textBrandHover, Styles.cursorPointer),
  style,
  target = COPY_BUTTON_ICON,
}: CopyButtonProps) => {
  const clipboard = useClipboard({ timeout: 2000 });

  const onCopyValue = useCallback(() => {
    clipboard.copy(value);
    onCopy?.();
  }, [clipboard, value, onCopy]);

  const copyOnEnter = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (isPlainKey(e, "Enter")) {
        onCopyValue();
      }
    },
    [onCopyValue],
  );

  return (
    <div
      className={className}
      data-testid="copy-button"
      onClick={onCopyValue}
      onKeyDown={copyOnEnter}
      style={style}
    >
      <Tooltip
        label={<Text fw={700} c="inherit">{t`Copied!`}</Text>}
        opened={clipboard.copied}
      >
        <span>{target}</span>
      </Tooltip>
    </div>
  );
};
