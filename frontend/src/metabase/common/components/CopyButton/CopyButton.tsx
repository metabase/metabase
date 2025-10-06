import cx from "classnames";
import { useCallback, useRef, useState } from "react";
import CopyToClipboard from "react-copy-to-clipboard";
import { useUnmount } from "react-use";
import { t } from "ttag";

import { isPlainKey } from "metabase/common/utils/keyboard";
import Styles from "metabase/css/core/index.css";
import { Icon, Text, Tooltip } from "metabase/ui";

import CopyButtonStyles from "./CopyButton.module.css";

export const COPY_BUTTON_ICON = (
  <Icon className={CopyButtonStyles.CopyButton} tabIndex={0} name="copy" />
);

type CopyButtonProps = {
  value: CopyToClipboard.Props["text"];
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
  const [copied, setCopied] = useState(false);
  const timeoutIdRef = useRef<number>();

  useUnmount(() => {
    window.clearTimeout(timeoutIdRef.current);
  });

  const onCopyValue = useCallback(() => {
    setCopied(true);

    window.clearTimeout(timeoutIdRef.current);
    timeoutIdRef.current = window.setTimeout(() => setCopied(false), 2000);
    onCopy?.();
  }, [onCopy]);

  const copyOnEnter = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (isPlainKey(e, "Enter")) {
        onCopyValue();
      }
    },
    [onCopyValue],
  );

  return (
    <CopyToClipboard text={value} onCopy={onCopyValue}>
      <div className={className} style={style} data-testid="copy-button">
        <Tooltip
          label={<Text fw={700} c="white">{t`Copied!`}</Text>}
          opened={copied}
        >
          <span onKeyDown={copyOnEnter}>{target}</span>
        </Tooltip>
      </div>
    </CopyToClipboard>
  );
};
