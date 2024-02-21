import { useState } from "react";
import CopyToClipboard from "react-copy-to-clipboard";
import { t } from "ttag";

import { Icon, Text, Tooltip } from "metabase/ui";

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
  className,
  style,
}: CopyButtonProps) => {
  const [copied, setCopied] = useState(false);

  const onCopyValue = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onCopy?.();
  };

  return (
    <CopyToClipboard text={value} onCopy={onCopyValue}>
      <div className={className} style={style} data-testid="copy-button">
        <Tooltip
          label={<Text fw={700} c="white">{t`Copied!`}</Text>}
          opened={copied}
        >
          <Icon name="copy" />
        </Tooltip>
      </div>
    </CopyToClipboard>
  );
};
