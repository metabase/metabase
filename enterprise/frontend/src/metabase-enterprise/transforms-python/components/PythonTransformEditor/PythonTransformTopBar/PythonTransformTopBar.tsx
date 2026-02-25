import { hasFeature } from "metabase/admin/databases/utils";
import {
  skipToken,
  useGetDatabaseQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { DatabaseDataSelector } from "metabase/query_builder/components/DataSelector";
import { EditDefinitionButton } from "metabase/transforms/components/TransformEditor/EditDefinitionButton";
import { doesDatabaseSupportTransforms } from "metabase/transforms/utils";
import { Flex, Text } from "metabase/ui";
import { EditTransformMenu } from "metabase-enterprise/data-studio/workspaces/components/EditTransformMenu";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import {
  type AdvancedTransformType,
  type Database,
  type DatabaseId,
  type Transform,
  isAdvancedTransformType,
} from "metabase-types/api";

import S from "./PythonTransformTopBar.module.css";
import { TransformTypeSelect } from "./TransformTypeSelect";
import { getTypeLabel } from "./utils";

type PythonTransformTopBarProps = {
  sourceType: AdvancedTransformType;
  databaseId?: DatabaseId;
  isEditMode?: boolean;
  readOnly?: boolean;
  transform?: Transform;
  onDatabaseChange?: (databaseId: DatabaseId) => void;
  canChangeDatabase?: boolean;
};

export function PythonTransformTopBar({
  sourceType,
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
  const canChangeType = isAdvancedTransformType(sourceType) && !transform?.id;

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

      <Flex
        h="3rem"
        p="md"
        ml="auto"
        align="center"
        data-testid="transform-type"
      >
        {canChangeType && <TransformTypeSelect defaultValue={sourceType} />}
      </Flex>
      <Flex ml="auto" mr="lg" align="center" h="3rem">
        {!canChangeType && !!sourceType && (
          <Text mr="md" fz="md">
            {getTypeLabel(sourceType)}
          </Text>
        )}
        {showEditButton && (
          <>
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
          </>
        )}
      </Flex>
    </Flex>
  );
}
