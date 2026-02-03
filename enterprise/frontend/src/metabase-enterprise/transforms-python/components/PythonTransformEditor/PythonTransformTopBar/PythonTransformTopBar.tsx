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
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { EditDefinitionButton } from "metabase-enterprise/transforms/components/TransformEditor/EditDefinitionButton";
import { EditTransformMenu } from "metabase-enterprise/transforms/components/TransformHeader/EditTransformMenu";
import { doesDatabaseSupportTransforms } from "metabase-enterprise/transforms/utils";
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
      {isEditMode && canChangeDatabase ? (
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
      {showEditButton && (
        <Flex ml="auto" mr="lg" align="center" h="3rem">
          {hasPremiumFeature("workspaces") ? (
            <EditTransformMenu transform={transform} />
          ) : (
            <EditDefinitionButton
              bg="transparent"
              fz="sm"
              h="1.5rem"
              px="sm"
              size="xs"
              transformId={transform.id}
            />
          )}
        </Flex>
      )}
    </Flex>
  );
}
