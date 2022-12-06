import React, { useCallback, useEffect, useState } from "react";
import { t } from "ttag";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import {
  QueryPanelCode,
  QueryPanelContainer,
  QueryPanelRoot,
  QueryPanelButton,
} from "./QueryPreviewPanel.styled";

export interface QueryPreviewPanelProps {
  code: string;
}

const QueryPreviewPanel = ({ code }: QueryPreviewPanelProps): JSX.Element => {
  const { isCopied, handleCopy, handleHidden } = useCopyButton(code);

  return (
    <QueryPanelRoot>
      <QueryPanelContainer>
        <QueryPanelCode>{code}</QueryPanelCode>
      </QueryPanelContainer>
      <Tooltip
        tooltip={isCopied ? t`Copied!` : t`Copy to clipboard`}
        hideOnClick={false}
        onHidden={handleHidden}
      >
        <QueryPanelButton onClick={handleCopy}>
          <Icon name="copy" />
        </QueryPanelButton>
      </Tooltip>
    </QueryPanelRoot>
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

export default QueryPreviewPanel;
