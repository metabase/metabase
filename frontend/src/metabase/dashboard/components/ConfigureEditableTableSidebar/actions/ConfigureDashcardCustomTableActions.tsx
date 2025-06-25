import { useCallback, useMemo } from "react";
import { jt, t } from "ttag";

import ExternalLink from "metabase/common/components/ExternalLink";
import { onUpdateDashCardVisualizationSettings } from "metabase/dashboard/actions";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { PLUGIN_TABLE_ACTIONS } from "metabase/plugins";
import { getDocsUrl } from "metabase/selectors/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import { Box, Stack, Text } from "metabase/ui";
import type {
  Dashboard,
  DashboardCard,
  TableActionDisplaySettings,
  TableRowActionDisplaySettings,
} from "metabase-types/api";

export const ConfigureDashcardCustomTableActions = ({
  dashboard,
  dashcard,
}: {
  dashboard: Dashboard;
  dashcard: DashboardCard;
}) => {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  const docsLink = useSelector((state) =>
    getDocsUrl(state, { page: "actions/custom" }),
  );
  const dispatch = useDispatch();

  const { enabledActions, tableActions } = useMemo(() => {
    const enabledActions =
      dashcard.visualization_settings?.["editableTable.enabledActions"] ?? [];

    const tableActions: TableRowActionDisplaySettings[] = [];

    enabledActions.forEach((tableActionSettings) => {
      if (
        !PLUGIN_TABLE_ACTIONS.isBuiltInEditableTableAction(tableActionSettings)
      ) {
        tableActions.push(tableActionSettings as TableRowActionDisplaySettings);
      }
    });

    return { enabledActions, tableActions };
  }, [dashcard.visualization_settings]);

  const tableColumns = useMemo(() => {
    const fieldsWithRemmapedColumns = dashcard.card.result_metadata ?? [];
    const fields = fieldsWithRemmapedColumns.filter((field) => {
      if ("remapped_from" in field) {
        return !field.remapped_from;
      }
      return true;
    });

    return fields;
  }, [dashcard.card.result_metadata]);

  const handleUpdateRowActions = useCallback(
    (newActions: TableActionDisplaySettings[]) => {
      const builtIns = enabledActions.filter(
        PLUGIN_TABLE_ACTIONS.isBuiltInEditableTableAction,
      );

      dispatch(
        onUpdateDashCardVisualizationSettings(dashcard.id, {
          "editableTable.enabledActions": [...builtIns, ...newActions],
        }),
      );
    },
    [dashcard.id, dispatch, enabledActions],
  );

  const ConfigureTableActions = PLUGIN_TABLE_ACTIONS.ConfigureTableActions;

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <Text size="lg" fw={700}>{t`Table actions`}</Text>
        <Text c="text-secondary" lh={1.4}>
          {jt`Create powerful actions to automate tasks or keep values across tables in sync.`}
          {showMetabaseLinks && (
            <>
              {" "}
              {jt`You can ${(<ExternalLink href={docsLink}>{t`learn more`}</ExternalLink>)} about it here.`}
            </>
          )}
        </Text>

        {dashboard && (
          <Box mt="md">
            <ConfigureTableActions
              value={tableActions}
              onChange={handleUpdateRowActions}
              cols={tableColumns}
            />
          </Box>
        )}
      </Stack>
    </Stack>
  );
};
