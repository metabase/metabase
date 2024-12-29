import { t } from "ttag";

import type { QueryModalType } from "metabase/query_builder/constants";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import { Button, Tooltip } from "metabase/ui";

import ViewTitleHeaderS from "../../ViewTitleHeader.module.css";

interface SaveQuestionButtonProps {
  onOpenModal: (modalType: QueryModalType) => void;
  isDisabled: boolean;
  permissionTooltip?: string;
}

export function SaveQuestionButton({
  onOpenModal,
  isDisabled,
  permissionTooltip,
}: SaveQuestionButtonProps) {
  const button = (
    <Button
      className={ViewTitleHeaderS.SaveButton}
      data-testid="qb-save-button"
      px="md"
      py="sm"
      variant="subtle"
      disabled={isDisabled}
      onClick={() => onOpenModal(MODAL_TYPES.SAVE)}
    >
      {t`Save`}
    </Button>
  );

  if (permissionTooltip) {
    return (
      <Tooltip label={permissionTooltip} position="left">
        {button}
      </Tooltip>
    );
  }

  return button;
}

interface RenderCheckOpts {
  hasSaveButton: boolean;
}

SaveQuestionButton.shouldRender = ({ hasSaveButton }: RenderCheckOpts) => {
  return hasSaveButton;
};
