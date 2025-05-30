import { PLUGIN_TABLE_ACTIONS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { TableActionExecuteModal } from "metabase-enterprise/table-actions/execution/TableActionExecuteModal";
import { useTableActionsExecute } from "metabase-enterprise/table-actions/execution/use-table-actions-execute";
import { ConfigureTableActions } from "metabase-enterprise/table-actions/settings/ConfigureTableActions/ConfigureTableActions";
import { isBuiltInEditableTableAction } from "metabase-enterprise/table-actions/utils";

if (hasPremiumFeature("table_data_editing")) {
  PLUGIN_TABLE_ACTIONS.isEnabled = () => true;
  PLUGIN_TABLE_ACTIONS.isBuiltInEditableTableAction =
    isBuiltInEditableTableAction;
  PLUGIN_TABLE_ACTIONS.useTableActionsExecute = useTableActionsExecute;
  PLUGIN_TABLE_ACTIONS.TableActionExecuteModal = TableActionExecuteModal;
  PLUGIN_TABLE_ACTIONS.ConfigureTableActions = ConfigureTableActions;
}
