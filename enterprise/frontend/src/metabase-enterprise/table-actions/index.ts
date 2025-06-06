import { PLUGIN_TABLE_ACTIONS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { TableActionExecuteModal } from "./execution/TableActionExecuteModal";
import { useTableActionsExecute } from "./execution/use-table-actions-execute";
import { isBuiltInEditableTableAction } from "./settings/AddOrEditActionSettingsContent/utils";
import { ConfigureTableActions } from "./settings/ConfigureTableActions/ConfigureTableActions";

if (hasPremiumFeature("table_data_editing")) {
  PLUGIN_TABLE_ACTIONS.isEnabled = () => true;
  PLUGIN_TABLE_ACTIONS.isBuiltInEditableTableAction =
    isBuiltInEditableTableAction;
  PLUGIN_TABLE_ACTIONS.useTableActionsExecute = useTableActionsExecute;
  PLUGIN_TABLE_ACTIONS.TableActionExecuteModal = TableActionExecuteModal;
  PLUGIN_TABLE_ACTIONS.ConfigureTableActions = ConfigureTableActions;
}
