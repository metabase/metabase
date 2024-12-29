import { t } from "ttag";

import type { QueryModalType } from "metabase/query_builder/constants";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import { Button, Tooltip } from "metabase/ui";

import ViewTitleHeaderS from "../../ViewTitleHeader.module.css";

interface QuestionSaveButtonProps {
  onOpenModal: (modalType: QueryModalType) => void;
  isDisabled: boolean;
  tooltip?: string;
}

export function QuestionSaveButton({
  onOpenModal,
  isDisabled,
  tooltip,
}: QuestionSaveButtonProps) {
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

  if (tooltip) {
    return (
      <Tooltip label={tooltip} position="left">
        {button}
      </Tooltip>
    );
  }

  return button;
}

interface RenderCheckOpts {
  hasSaveButton: boolean;
}

QuestionSaveButton.shouldRender = ({ hasSaveButton }: RenderCheckOpts) => {
  return hasSaveButton;
};
