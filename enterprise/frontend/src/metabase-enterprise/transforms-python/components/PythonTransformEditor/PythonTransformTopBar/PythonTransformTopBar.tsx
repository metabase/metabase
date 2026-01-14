import { t } from "ttag";

import { hasFeature } from "metabase/admin/databases/utils";
import {
  skipToken,
  useGetDatabaseQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { ForwardRefLink } from "metabase/common/components/Link";
import * as Urls from "metabase/lib/urls";
import { DatabaseDataSelector } from "metabase/query_builder/components/DataSelector";
import { ActionIcon, Flex, Group, Icon, Tooltip } from "metabase/ui";
import { EditDefinitionButton } from "metabase-enterprise/transforms/components/TransformEditor/EditDefinitionButton";
import { doesDatabaseSupportTransforms } from "metabase-enterprise/transforms/utils";
import { SHARED_LIB_IMPORT_PATH } from "metabase-enterprise/transforms-python/constants";
import type { Database, DatabaseId, TransformId } from "metabase-types/api";

import {
  hasImport,
  insertImport,
  removeImport,
} from "../PythonEditorBody/utils";

import S from "./PythonTransformTopBar.module.css";

type PythonTransformTopBarProps = {
  databaseId?: DatabaseId;
  readOnly?: boolean;
  transformId?: TransformId;
  source?: string;
  onDatabaseChange?: (databaseId: DatabaseId) => void;
  onSourceChange?: (source: string) => void;
};

export function PythonTransformTopBar({
  databaseId,
  readOnly,
  transformId,
  source,
  onDatabaseChange,
  onSourceChange,
}: PythonTransformTopBarProps) {
  const showReadonlyControls = readOnly && transformId;

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

  const handleToggleSharedLib = () => {
    if (source != null && onSourceChange) {
      if (hasImport(source, SHARED_LIB_IMPORT_PATH)) {
        onSourceChange(removeImport(source, SHARED_LIB_IMPORT_PATH));
      } else {
        onSourceChange(insertImport(source, SHARED_LIB_IMPORT_PATH));
      }
    }
  };

  return (
    <Flex
      align="flex-start"
      bg="background-secondary"
      data-testid="python-transform-top-bar"
      className={S.TopBar}
    >
      {readOnly ? (
        <Flex
          h="3rem"
          p="md"
          ml="sm"
          align="center"
          data-testid="selected-database"
        >
          {database?.name}
        </Flex>
      ) : (
        <Flex h="3rem" ml="sm" align="center" data-testid="selected-database">
          <DatabaseDataSelector
            className={S.databaseSelector}
            selectedDatabaseId={databaseId}
            setDatabaseFn={handleDatabaseChange}
            databases={databases?.data ?? []}
            readOnly={readOnly}
            databaseIsDisabled={(database: Database) =>
              !doesDatabaseSupportTransforms(database) ||
              !hasFeature(database, "transforms/python")
            }
          />
        </Flex>
      )}
      <Flex ml="auto" mr="lg" align="center" h="3rem">
        {showReadonlyControls ? (
          <EditDefinitionButton
            bg="transparent"
            fz="sm"
            h="1.5rem"
            px="sm"
            size="xs"
            transformId={transformId}
          />
        ) : (
          <Group gap="sm">
            <Tooltip label={t`Import common library`}>
              <ActionIcon
                aria-label={t`Import common library`}
                onClick={handleToggleSharedLib}
              >
                <Icon name="reference" c="text-primary" />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t`Edit common library`}>
              <ActionIcon
                component={ForwardRefLink}
                target="_blank"
                aria-label={t`Edit common library`}
                to={Urls.transformPythonLibrary({
                  path: SHARED_LIB_IMPORT_PATH,
                })}
              >
                <Icon name="pencil" c="text-primary" />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </Flex>
    </Flex>
  );
}
