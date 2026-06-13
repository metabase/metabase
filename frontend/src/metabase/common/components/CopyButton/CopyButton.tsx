import { useClipboard, useTimeout } from "@mantine/hooks";
import cx from "classnames";
import { useCallback, useState } from "react";
import { t } from "ttag";

import { isPlainKey } from "metabase/common/utils/keyboard";
import Styles from "metabase/css/core/index.css";
import { Icon, Text, Tooltip } from "metabase/ui";

import CopyButtonStyles from "./CopyButton.module.css";

export const COPY_BUTTON_ICON = (
  <Icon className={CopyButtonStyles.CopyButton} tabIndex={0} name="copy" />
);

// A ready-to-copy string, or a getter that may resolve the value asynchronously
// (e.g. a secret that must be fetched on demand). Async getters are copied via
// the ClipboardItem promise API so the write keeps the user activation — plain
// `writeText` after an `await` is blocked by Safari.
type CopyValue = string | (() => string | Promise<string>);

const COPY_FEEDBACK_TIMEOUT = 2000;

type CopyButtonProps = {
  value: CopyValue;
  onCopy?: () => void;
  className?: string;
  style?: object;
  "aria-label"?: string;
  "data-testid"?: string;
  target?: React.ReactNode;
};

export const CopyButton = ({
  value,
  onCopy,
  className = cx(Styles.textBrandHover, Styles.cursorPointer),
  style,
  "aria-label": ariaLabel,
  "data-testid": dataTestId = "copy-button",
  target = COPY_BUTTON_ICON,
}: CopyButtonProps) => {
  const clipboard = useClipboard({ timeout: COPY_FEEDBACK_TIMEOUT });

  // The Mantine clipboard hook only tracks `copied` for its own synchronous
  // `copy()`. The async path writes via ClipboardItem, so it manages its own
  // feedback flag.
  const [asyncCopied, setAsyncCopied] = useState(false);
  const { start: resetAsyncCopied } = useTimeout(
    () => setAsyncCopied(false),
    COPY_FEEDBACK_TIMEOUT,
  );

  const onCopyValue = useCallback(() => {
    const resolved = typeof value === "function" ? value() : value;

    if (typeof resolved === "string") {
      clipboard.copy(resolved);
    } else {
      // Hand the still-pending text to the clipboard synchronously so the write
      // stays within the user gesture while it resolves (Safari requirement).
      void navigator.clipboard
        .write([
          new ClipboardItem({
            "text/plain": resolved.then(
              (text) => new Blob([text], { type: "text/plain" }),
            ),
          }),
        ])
        .then(() => {
          setAsyncCopied(true);
          resetAsyncCopied();
        })
        .catch(() => {
          // Leave the feedback untouched if the copy is rejected.
        });
    }

    onCopy?.();
  }, [clipboard, value, onCopy, resetAsyncCopied]);

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
      data-testid={dataTestId}
      aria-label={ariaLabel}
      onClick={onCopyValue}
      onKeyDown={copyOnEnter}
      style={style}
    >
      <Tooltip
        label={<Text fw={700} c="inherit">{t`Copied!`}</Text>}
        opened={clipboard.copied || asyncCopied}
      >
        <span>{target}</span>
      </Tooltip>
    </div>
  );
};
