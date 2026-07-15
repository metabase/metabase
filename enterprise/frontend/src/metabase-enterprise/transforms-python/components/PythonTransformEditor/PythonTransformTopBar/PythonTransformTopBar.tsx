import {
  skipToken,
  useGetDatabaseQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { hasFeature } from "metabase/common/utils/database";
import { DatabaseDataSelector } from "metabase/querying/common/components/DataSelector";
import { useSelector } from "metabase/redux";
import { EditDefinitionButton } from "metabase/transforms/components/TransformEditor/EditDefinitionButton";
import { doesDatabaseSupportTransforms } from "metabase/transforms/utils";
import { Flex } from "metabase/ui";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type MetadataDatabase from "metabase-lib/v1/metadata/Database";
import type { Database, DatabaseId, Transform } from "metabase-types/api";

import S from "./PythonTransformTopBar.module.css";

type PythonTransformTopBarProps = {
  databaseId?: DatabaseId;
  isEditMode?: boolean;
  readOnly?: boolean;
  transform?: Transform;
  onDatabaseChange?: (databaseId: DatabaseId) => void;
  canChangeDatabase?: boolean;
};

export function PythonTransformTopBar({
  databaseId,
  isEditMode,
  readOnly,
  transform,
  onDatabaseChange,
  canChangeDatabase = true,
}: PythonTransformTopBarProps) {
  const isRemoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);
  const showEditButton =
    !isEditMode && transform && !isRemoteSyncReadOnly && !readOnly;

  const { data: database } = useGetDatabaseQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );
  const { data: databases } = useListDatabasesQuery();

  const handleDatabaseChange = (newDatabaseId: DatabaseId) => {
    if (newDatabaseId !== databaseId) {
      onDatabaseChange?.(newDatabaseId);
    }
  };

  return (
    <Flex
      align="flex-start"
      bg="background_page-secondary"
      data-testid="python-transform-top-bar"
      className={S.TopBar}
    >
      {isEditMode && canChangeDatabase ? (
        <Flex h="3rem" ml="sm" align="center" data-testid="selected-database">
          <DatabaseDataSelector
            className={S.databaseSelector}
            selectedDatabaseId={databaseId}
            setDatabaseFn={handleDatabaseChange}
            // DataSelector is typed against metabase-lib entities; here we feed
            // it plain API databases, which carry the fields it actually reads.
            // TODO(dataselector-api-vs-metabase-lib-casts): remove this cast once
            // DataSelector's entity props use structural interfaces.
            databases={(databases?.data ?? []) as unknown as MetadataDatabase[]}
            readOnly={!isEditMode}
            databaseIsDisabled={
              // DataSelector types this callback against metabase-lib databases;
              // the predicate only reads plain API database fields.
              // TODO(dataselector-api-vs-metabase-lib-casts): remove this cast
              // once DataSelector's entity props use structural interfaces.
              ((database: Database) =>
                !doesDatabaseSupportTransforms(database) ||
                !hasFeature(database, "transforms/python")) as unknown as (
                database: MetadataDatabase,
              ) => boolean
            }
          />
        </Flex>
      ) : (
        <Flex
          h="3rem"
          p="md"
          ml="sm"
          align="center"
          data-testid="selected-database"
        >
          {database?.name}
        </Flex>
      )}
      {showEditButton && (
        <Flex ml="auto" mr="lg" align="center" h="3rem">
          <EditDefinitionButton
            bg="transparent"
            fz="sm"
            h="1.5rem"
            px="sm"
            size="xs"
            transformId={transform.id}
          />
        </Flex>
      )}
    </Flex>
  );
}
