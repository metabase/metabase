import { hasFeature } from "metabase/admin/databases/utils";
import {
  skipToken,
  useGetDatabaseQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { DatabaseDataSelector } from "metabase/query_builder/components/DataSelector";
import { Flex } from "metabase/ui";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import { EditDefinitionButton } from "metabase-enterprise/transforms/components/TransformEditor/EditDefinitionButton";
import { doesDatabaseSupportTransforms } from "metabase-enterprise/transforms/utils";
import type { Database, DatabaseId, TransformId } from "metabase-types/api";

import S from "./PythonTransformTopBar.module.css";

type PythonTransformTopBarProps = {
  databaseId?: DatabaseId;
  isEditMode?: boolean;
  transformId?: TransformId;
  onDatabaseChange?: (databaseId: DatabaseId) => void;
};

export function PythonTransformTopBar({
  databaseId,
  isEditMode,
  transformId,
  onDatabaseChange,
}: PythonTransformTopBarProps) {
  const isRemoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);
  const showEditDefinitionButton =
    !isEditMode && transformId && !isRemoteSyncReadOnly;

  const { data: database } = useGetDatabaseQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );
  const { data: databases } = useListDatabasesQuery();

  const handleDatabaseChange = (value: string | null) => {
    const newDatabaseId = value ? parseInt(value) : undefined;
    if (newDatabaseId != null && newDatabaseId !== databaseId) {
      onDatabaseChange?.(newDatabaseId);
    }
  };

  return (
    <Flex
      align="flex-start"
      bg="background-secondary"
      data-testid="python-transform-top-bar"
      className={S.TopBar}
    >
      {isEditMode ? (
        <Flex h="3rem" ml="sm" align="center" data-testid="selected-database">
          <DatabaseDataSelector
            className={S.databaseSelector}
            selectedDatabaseId={databaseId}
            setDatabaseFn={handleDatabaseChange}
            databases={databases?.data ?? []}
            readOnly={!isEditMode}
            databaseIsDisabled={(database: Database) =>
              !doesDatabaseSupportTransforms(database) ||
              !hasFeature(database, "transforms/python")
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
      {showEditDefinitionButton && (
        <Flex ml="auto" mr="lg" align="center" h="3rem">
          <EditDefinitionButton
            bg="transparent"
            fz="sm"
            h="1.5rem"
            px="sm"
            size="xs"
            transformId={transformId}
          />
        </Flex>
      )}
    </Flex>
  );
}
