import React, { useCallback } from "react";
import { t } from "ttag";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import {
  QueryPanelButton,
  QueryPanelCode,
  QueryPanelContainer,
  QueryPanelRoot,
} from "./QueryPreviewPanel.styled";

export interface QueryPreviewPanelProps {
  code: string;
}

const QueryPreviewPanel = ({ code }: QueryPreviewPanelProps): JSX.Element => {
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
  }, [code]);

  return (
    <QueryPanelRoot>
      <QueryPanelContainer>
        <QueryPanelCode>{code}</QueryPanelCode>
      </QueryPanelContainer>
      <Tooltip tooltip={t`Copy the query to the clipboard`}>
        <QueryPanelButton onClick={handleCopy}>
          <Icon name="copy" />
        </QueryPanelButton>
      </Tooltip>
    </QueryPanelRoot>
  );
};

export default QueryPreviewPanel;
