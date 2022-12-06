import React, { useCallback } from "react";
import { t } from "ttag";
import Tooltip from "metabase/components/Tooltip";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import { PreviewButton, PreviewButtonIcon } from "./QueryPreviewButton.styled";

export interface QueryPreviewButtonProps {
  onOpenModal?: (modalType: string) => void;
}

const QueryPreviewButton = ({
  onOpenModal,
}: QueryPreviewButtonProps): JSX.Element => {
  const handleClick = useCallback(() => {
    onOpenModal?.(MODAL_TYPES.QUERY_PREVIEW);
  }, [onOpenModal]);

  return (
    <Tooltip tooltip={t`Preview the query`}>
      <PreviewButton onClick={handleClick}>
        <PreviewButtonIcon name="eye_filled" />
      </PreviewButton>
    </Tooltip>
  );
};

export default QueryPreviewButton;
