import cx from "classnames";
import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import Tooltip from "metabase/core/components/Tooltip";
import { Flex, Icon } from "metabase/ui";

import NativeCodePanelS from "./NativeCodePanel.module.css";

interface NativeCodePanelProps {
  value: string;
  isHighlighted?: boolean;
  isCopyEnabled?: boolean;
}

export const NativeCodePanel = ({
  value,
  isHighlighted,
  isCopyEnabled,
}: NativeCodePanelProps): JSX.Element => {
  const { isCopied, handleCopy } = useCopyButton(value);

  return (
    <Flex className={NativeCodePanelS.CodeRoot}>
      <pre
        className={cx(NativeCodePanelS.CodeContainer, {
          [NativeCodePanelS.isHighlighted]: isHighlighted,
        })}
      >
        <code className={NativeCodePanelS.CodeText}>{value}</code>
      </pre>
      {isCopyEnabled && (
        <Tooltip tooltip={t`Copied!`} isOpen={isCopied}>
          <IconButtonWrapper
            className={cx(NativeCodePanelS.CodeCopyButton, {
              [NativeCodePanelS.isHighlighted]: isHighlighted,
            })}
            onClick={handleCopy}
          >
            <Icon name="copy" />
          </IconButtonWrapper>
        </Tooltip>
      )}
    </Flex>
  );
};

const useCopyButton = (value: string) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value);
    setIsCopied(true);
  }, [value]);

  useEffect(() => {
    if (isCopied) {
      const timeout = setTimeout(() => setIsCopied(false), 2000);
      return () => clearTimeout(timeout);
    }
  }, [isCopied]);

  return { isCopied, handleCopy };
};
