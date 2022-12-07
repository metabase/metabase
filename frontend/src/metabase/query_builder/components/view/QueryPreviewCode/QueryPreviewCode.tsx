import React, { useCallback, useEffect, useState } from "react";
import { t } from "ttag";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import {
  CodeCopyButton,
  CodeText,
  CodeContainer,
  CodeRoot,
} from "./QueryPreviewCode.styled";

export interface QueryPreviewCodeProps {
  code: string;
}

const QueryPreviewCode = ({ code }: QueryPreviewCodeProps): JSX.Element => {
  const { isCopied, handleCopy } = useCopyButton(code);

  return (
    <CodeRoot>
      <CodeContainer>
        <CodeText>{code}</CodeText>
      </CodeContainer>
      <Tooltip tooltip={t`Copied!`} isOpen={isCopied}>
        <CodeCopyButton onClick={handleCopy}>
          <Icon name="copy" />
        </CodeCopyButton>
      </Tooltip>
    </CodeRoot>
  );
};

const useCopyButton = (code: string) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setIsCopied(true);
  }, [code]);

  useEffect(() => {
    if (isCopied) {
      const timeout = setTimeout(() => setIsCopied(false), 2000);
      return () => clearTimeout(timeout);
    }
  }, [isCopied]);

  return { isCopied, handleCopy };
};

export default QueryPreviewCode;
