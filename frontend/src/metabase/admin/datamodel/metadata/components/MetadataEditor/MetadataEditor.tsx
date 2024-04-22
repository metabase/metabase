import cx from "classnames";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import Databases from "metabase/entities/databases";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import type Database from "metabase-lib/v1/metadata/Database";

import MetadataHeader from "../MetadataHeader";
import MetadataTable from "../MetadataTable";
import MetadataTablePicker from "../MetadataTablePicker";

import {
  MetadataMain,
  MetadataContent,
  MetadataWrapper,
  MetadataSidebar,
} from "./MetadataEditor.styled";

interface RouteParams {
  databaseId?: string;
  schemaId?: string;
  tableId?: string;
}

interface RouterProps {
  params: RouteParams;
}

interface DatabaseLoaderProps {
  databases: Database[];
}

type MetadataEditorProps = RouterProps & DatabaseLoaderProps;

const MetadataEditor = ({ databases, params }: MetadataEditorProps) => {
  const databaseId = Urls.extractEntityId(params.databaseId);
  const schemaId = params.schemaId;
  const tableId = Urls.extractEntityId(params.tableId);
  const hasDatabaseId = databaseId != null;
  const hasSchemaId = schemaId != null;
  const hasTableId = tableId != null;
  const hasDatabases = databases.length !== 0;

  return (
    <MetadataWrapper>
      <MetadataHeader
        selectedDatabaseId={databaseId}
        selectedSchemaId={schemaId}
        selectedTableId={tableId}
      />
      <MetadataMain>
        {hasDatabaseId && (
          <MetadataSidebar>
            <MetadataTablePicker
              selectedDatabaseId={databaseId}
              selectedSchemaId={schemaId}
              selectedTableId={tableId}
            />
          </MetadataSidebar>
        )}
        <MetadataContent>
          {hasDatabaseId && hasSchemaId && hasTableId ? (
            <MetadataTable
              selectedDatabaseId={databaseId}
              selectedSchemaId={schemaId}
              selectedTableId={tableId}
            />
          ) : (
            <div className={cx(CS.full, CS.textCentered)}>
              <h2 className={CS.textMedium}>
                {hasDatabases
                  ? t`Select any table to see its schema and add or edit metadata.`
                  : t`The page you asked for couldn't be found.`}
              </h2>
            </div>
          )}
        </MetadataContent>
      </MetadataMain>
    </MetadataWrapper>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Databases.loadList({
  query: PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
})(MetadataEditor);
