import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import { Icon } from "metabase/ui";

import {
  CodeContainer,
  CodeCopyButton,
  CodeRoot,
  CodeText,
} from "./NativeCodePanel.styled";

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
    <CodeRoot>
      <CodeContainer isHighlighted={isHighlighted}>
        <CodeText>{value}</CodeText>
      </CodeContainer>
      {isCopyEnabled && (
        <Tooltip tooltip={t`Copied!`} isOpen={isCopied}>
          <CodeCopyButton isHighlighted={isHighlighted} onClick={handleCopy}>
            <Icon name="copy" />
          </CodeCopyButton>
        </Tooltip>
      )}
    </CodeRoot>
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
