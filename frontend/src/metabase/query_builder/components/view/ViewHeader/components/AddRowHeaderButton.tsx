import cx from "classnames";
import { t } from "ttag";

import type { QueryModalType } from "metabase/query_builder/constants";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import { Button, Icon } from "metabase/ui";

import ViewTitleHeaderS from "../ViewTitleHeader.module.css";

interface AddRowHeaderButtonProps {
  className?: string;
  onOpenModal: (modalType: QueryModalType) => void;
}

export function AddRowHeaderButton({
  className,
  onOpenModal,
}: AddRowHeaderButtonProps) {
  return (
    <Button
      leftIcon={<Icon name="add" />}
      className={cx(className, ViewTitleHeaderS.FilterButton)}
      onClick={() => onOpenModal(MODAL_TYPES.ADD_ROW)}
      data-testid="table-add-row-header"
    >
      {t`Add row`}
    </Button>
  );
}
