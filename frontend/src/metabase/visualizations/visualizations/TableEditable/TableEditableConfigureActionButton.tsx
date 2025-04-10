import { t } from "ttag";

import { showConfigureEditableTableSidebar } from "metabase/dashboard/actions";
import { DashCardActionButton } from "metabase/dashboard/components/DashCard/DashCardActionsPanel/DashCardActionButton";
import { useDispatch } from "metabase/lib/redux";
import { Icon } from "metabase/ui";
import type { DashboardCard } from "metabase-types/api";

type TableEditableConfigureActionButtonProps = {
  dashcard?: DashboardCard;
};
export const TableEditableConfigureActionButton = ({
  dashcard,
}: TableEditableConfigureActionButtonProps) => {
  const dispatch = useDispatch();

  if (!dashcard) {
    return null;
  }

  return (
    <DashCardActionButton
      key="configure-editable-table"
      aria-label={t`Configure`}
      tooltip={t`Configure`}
      onClick={() => dispatch(showConfigureEditableTableSidebar(dashcard.id))}
    >
      <Icon name="gear" />
    </DashCardActionButton>
  );
};
