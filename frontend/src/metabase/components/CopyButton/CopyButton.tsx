import { useState } from "react";
import CopyToClipboard from "react-copy-to-clipboard";
import { t } from "ttag";

import { Icon, type IconProps, Text, Tooltip } from "metabase/ui";

type CopyButtonProps = {
  value: CopyToClipboard.Props["text"];
  onCopy?: () => void;
  className?: string;
  style?: object;
  "aria-label"?: string;
} & Partial<IconProps>;

export const CopyButton = ({
  value,
  onCopy,
  className,
  style,
  ...iconProps
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
          label={
            <Text fw={700} c="var(--mb-color-text-white)">{t`Copied!`}</Text>
          }
          opened={copied}
        >
          <Icon name="copy" {...iconProps} />
        </Tooltip>
      </div>
    </CopyToClipboard>
  );
};
