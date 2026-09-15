import {
  skipToken,
  useGetDatabaseQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { hasFeature } from "metabase/databases";
import { DatabaseDataSelector } from "metabase/querying/common/components/DataSelector";
import { EditDefinitionButton } from "metabase/transforms/components/TransformEditor/EditDefinitionButton";
import { doesDatabaseSupportTransforms } from "metabase/transforms/utils";
import { Flex } from "metabase/ui";
import type { DatabaseId, Transform } from "metabase-types/api";

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
  const showEditButton = !isEditMode && transform && !readOnly;

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
        <Flex h="3rem" ms="sm" align="center" data-testid="selected-database">
          <DatabaseDataSelector
            className={S.databaseSelector}
            selectedDatabaseId={databaseId}
            setDatabaseFn={handleDatabaseChange}
            databases={databases?.data ?? []}
            readOnly={!isEditMode}
            databaseIsDisabled={(database) =>
              !doesDatabaseSupportTransforms(database) ||
              !hasFeature(database, "transforms/python")
            }
          />
        </Flex>
      ) : (
        <Flex
          h="3rem"
          p="lg"
          ms="sm"
          align="center"
          data-testid="selected-database"
        >
          {database?.name}
        </Flex>
      )}
      {showEditButton && (
        <Flex ms="auto" me="xl" align="center" h="3rem">
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
