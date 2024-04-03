import cx from "classnames";
import { t } from "ttag";

import {
  useDiscardTableFieldValuesMutation,
  useGetDatabaseQuery,
  useGetTableQuery,
  useListDatabaseSchemasQuery,
  useRescanTableFieldValuesMutation,
} from "metabase/api";
import ActionButton from "metabase/components/ActionButton";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { parseSchemaId } from "metabase-lib/v1/metadata/utils/schema";

import MetadataBackButton from "../MetadataBackButton";
import MetadataSection from "../MetadataSection";
import MetadataSectionHeader from "../MetadataSectionHeader";

interface RouteParams {
  databaseId: string;
  schemaId: string;
  tableId: string;
}

type MetadataTableSettingsProps = {
  params: RouteParams;
};

const MetadataTableSettings = ({
  params: { databaseId, schemaId, tableId },
}: MetadataTableSettingsProps) => {
  const [_, schema] = parseSchemaId(schemaId);
  const { data: database } = useGetDatabaseQuery({
    id: parseInt(databaseId),
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  });
  const { data: schemas } = useListDatabaseSchemasQuery({
    id: parseInt(databaseId),
    include_hidden: true,
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  });
  const { data: table } = useGetTableQuery({
    id: parseInt(tableId),
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  });
  const [rescanTableFieldValues] = useRescanTableFieldValuesMutation();
  const [discardTableFieldValues] = useDiscardTableFieldValuesMutation();

  if (!database || !schemas || !table) {
    return null;
  }

  return (
    <div className={CS.relative}>
      <div className={cx(CS.wrapper, CS.wrapperTrim)}>
        <div className={cx(CS.flex, CS.alignCenter, CS.my2)}>
          <MetadataBackButton
            selectedDatabaseId={database.id}
            selectedSchemaId={schemaId}
            selectedTableId={table.id}
          />
          <div className="my4 py1 ml2">
            <Breadcrumbs
              crumbs={[
                [database.name, Urls.dataModelDatabase(database.id)],
                ...(schema && schemas.length > 1
                  ? [[schema, Urls.dataModelSchema(database.id, schemaId)]]
                  : []),
                [
                  table.display_name,
                  Urls.dataModelTable(database.id, schemaId, table.id),
                ],
                t`Settings`,
              ]}
            />
          </div>
        </div>
        <MetadataSection>
          <MetadataSectionHeader
            title={t`Cached field values`}
            description={t`Metabase can scan the values in this table to enable checkbox filters in dashboards and questions.`}
          />
          <ActionButton
            className={cx(ButtonsS.Button, CS.mr2)}
            actionFn={() => rescanTableFieldValues(table.id)}
            normalText={t`Re-scan this table`}
            activeText={t`Starting…`}
            failedText={t`Failed to start scan`}
            successText={t`Scan triggered!`}
          />
          <ActionButton
            className={cx(ButtonsS.Button, ButtonsS.ButtonDanger)}
            actionFn={() => discardTableFieldValues(table.id)}
            normalText={t`Discard cached field values`}
            activeText={t`Starting…`}
            failedText={t`Failed to discard values`}
            successText={t`Discard triggered!`}
          />
        </MetadataSection>
      </div>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MetadataTableSettings;
