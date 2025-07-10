import { useCallback, useState } from "react";

import { ActionDashcardSettings } from "metabase/actions/components/ActionViz/ActionDashcardSettings";
import { isModelAction, isTableAction } from "metabase/actions/utils";
import type {
  ActionItem,
  ModelItem,
  TableItem,
} from "metabase/common/components/DataPicker";
import { TableOrModelActionPicker } from "metabase/common/components/TableOrModelActionPicker";
import { setActionForDashcard } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";
// TODO: Remove this once we have a proper API for actions.
// eslint-disable-next-line no-restricted-imports
import { useGetActionsQuery } from "metabase-enterprise/api";
import type {
  ActionDashboardCard,
  Dashboard,
  WritebackAction,
} from "metabase-types/api";

interface Props {
  dashboard: Dashboard;
  dashcard: ActionDashboardCard;
  onClose: () => void;
}

export const DashboardActionPickerContent = ({
  dashboard,
  dashcard,
  onClose,
}: Props) => {
  const action = dashcard.action;
  const { data: actions } = useGetActionsQuery();

  const [newActionInitialParentItem, setNewActionInitialParentItem] = useState<
    TableItem | ModelItem | undefined
  >();

  const showNewActionStep = !!newActionInitialParentItem;

  const dispatch = useDispatch();

  const setAction = (newActionItem: ActionItem | undefined) => {
    const action = actions?.find(({ id }) => id === newActionItem?.id);

    if (action) {
      dispatch(setActionForDashcard(dashcard, action as WritebackAction));
      setNewActionInitialParentItem(undefined);
    }
  };

  const handleChangeAction = useCallback(
    (newAction: WritebackAction) => {
      dispatch(setActionForDashcard(dashcard, newAction));
      setNewActionInitialParentItem(undefined);
    },
    [dashcard, dispatch],
  );

  const handleClose = useCallback(() => {
    onClose();
    setNewActionInitialParentItem(undefined);
  }, [onClose]);

  const handleChooseNewAction = useCallback(() => {
    if (!action) {
      return;
    }

    if (isModelAction(action)) {
      const parentItem: ModelItem = {
        model: "dataset",
        id: action.model_id,
        name: "",
      };
      setNewActionInitialParentItem(parentItem);
    }

    if (isTableAction(action)) {
      const parentItem: TableItem = {
        model: "table",
        id: action.table_id,
        name: "",
      };
      setNewActionInitialParentItem(parentItem);
    }
  }, [action]);

  if (!action || showNewActionStep) {
    return (
      <TableOrModelActionPicker
        value={newActionInitialParentItem}
        initialDbId={undefined}
        onChange={setAction}
        onClose={handleClose}
      />
    );
  }

  return (
    <ActionDashcardSettings
      action={action as WritebackAction}
      dashboard={dashboard}
      dashcard={dashcard}
      onChooseNewAction={handleChooseNewAction}
      onChangeAction={handleChangeAction}
      onClose={handleClose}
    />
  );
};
