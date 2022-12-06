import React, { useCallback, useEffect, useState } from "react";
import { t } from "ttag";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import {
  NativeCodeText,
  NativeCodeContainer,
  NativeCodeRoot,
  NativeCodeButton,
} from "./NativeCode.styled";

export interface NativeCodeProps {
  code: string;
}

const NativeCode = ({ code }: NativeCodeProps): JSX.Element => {
  const { isCopied, handleCopy, handleHidden } = useCopyButton(code);

  return (
    <NativeCodeRoot>
      <NativeCodeContainer>
        <NativeCodeText>{code}</NativeCodeText>
      </NativeCodeContainer>
      <Tooltip
        tooltip={isCopied ? t`Copied!` : t`Copy to clipboard`}
        hideOnClick={false}
        onHidden={handleHidden}
      >
        <NativeCodeButton onClick={handleCopy}>
          <Icon name="copy" />
        </NativeCodeButton>
      </Tooltip>
    </NativeCodeRoot>
  );
};

const useCopyButton = (text: string) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setIsCopied(true);
  }, [text]);

  const handleHidden = useCallback(() => {
    setIsCopied(false);
  }, []);

  useEffect(() => {
    if (isCopied) {
      const timerId = setTimeout(() => setIsCopied(false), 5000);
      return () => clearTimeout(timerId);
    }
  }, [isCopied]);

  return { isCopied, handleCopy, handleHidden };
};

export default NativeCode;
