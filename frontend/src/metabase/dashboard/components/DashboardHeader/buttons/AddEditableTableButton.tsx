import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { toggleSidebar } from "metabase/dashboard/actions";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { getSidebar } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";

export const AddEditableTableButton = () => {
  const dispatch = useDispatch();
  const sidebar = useSelector(getSidebar);

  const title = t`Add editable table`;

  return (
    <ToolbarButton
      tooltipLabel={title}
      icon="table"
      isActive={sidebar.name === SIDEBAR_NAME.addEditableTable}
      onClick={() => dispatch(toggleSidebar(SIDEBAR_NAME.addEditableTable))}
      aria-label={title}
    />
  );
};
