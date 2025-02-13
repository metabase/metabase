import cx from "classnames";
import { useCallback, useState } from "react";
import CopyToClipboard from "react-copy-to-clipboard";
import { t } from "ttag";

import { isPlainKey } from "metabase/common/utils/keyboard";
import Styles from "metabase/css/core/index.css";
import { Icon, Text, Tooltip } from "metabase/ui";

import CopyButtonStyles from "./CopyButton.module.css";

type CopyButtonProps = {
  value: CopyToClipboard.Props["text"];
  onCopy?: () => void;
  className?: string;
  style?: object;
  "aria-label"?: string;
};

export const CopyButton = ({
  value,
  onCopy,
  className = cx(Styles.textBrandHover, Styles.cursorPointer),
  style,
}: CopyButtonProps) => {
  const [copied, setCopied] = useState(false);

  const onCopyValue = useCallback(() => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onCopy?.();
  }, [onCopy]);

  const copyOnEnter = useCallback(
    (e: React.KeyboardEvent<SVGElement>) => {
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
          label={
            <Text fw={700} c="--var(mb-color-text-white)">{t`Copied!`}</Text>
          }
          opened={copied}
        >
          <Icon
            className={CopyButtonStyles.CopyButton}
            tabIndex={0}
            onKeyDown={copyOnEnter}
            name="copy"
          />
        </Tooltip>
      </div>
    </CopyToClipboard>
  );
};
