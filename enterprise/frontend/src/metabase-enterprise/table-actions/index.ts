import { PLUGIN_TABLE_ACTIONS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { DataGridActionExecuteModal } from "./execution/DataGridActionExecuteModal";
import { useDataGridRowActions } from "./execution/use-datagrid-row-actions";
import { isBuiltInEditableTableAction } from "./settings/AddOrEditActionSettingsContent/utils";
import { ConfigureTableActions } from "./settings/ConfigureTableActions/ConfigureTableActions";

if (hasPremiumFeature("table_data_editing")) {
  PLUGIN_TABLE_ACTIONS.isEnabled = () => true;
  PLUGIN_TABLE_ACTIONS.isBuiltInEditableTableAction =
    isBuiltInEditableTableAction;
  PLUGIN_TABLE_ACTIONS.useDataGridRowActions = useDataGridRowActions;
  PLUGIN_TABLE_ACTIONS.DataGridActionExecuteModal = DataGridActionExecuteModal;
  PLUGIN_TABLE_ACTIONS.ConfigureTableActions = ConfigureTableActions;
}
