import { t } from "ttag";

import {
  getInitialNativeSource,
  getInitialPythonSource,
} from "metabase/transforms/pages/NewTransformPage/utils";
import { ActionIcon, Icon, Menu, Tooltip } from "metabase/ui";
import type { DatabaseId, TransformSource } from "metabase-types/api";
import { createMockTransform } from "metabase-types/api/mocks/transform";

import { useWorkspace } from "./WorkspaceProvider";

type TransformType = "sql" | "python";

interface Props {
  databaseId: DatabaseId;
  disabled?: boolean;
}

export const AddTransformMenu = ({ databaseId, disabled }: Props) => {
  const { addUnsavedTransform } = useWorkspace();

  const getSource = (type: TransformType): TransformSource => {
    if (type === "sql") {
      const source = getInitialNativeSource();
      return {
        ...source,
        query: { ...source.query, database: databaseId },
      };
    }
    return {
      ...getInitialPythonSource(),
      "source-database": databaseId,
    };
  };

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <Tooltip label={t`Add transform`}>
            <ActionIcon
              size="2rem"
              p="0"
              ml="auto"
              aria-label={t`Add transform`}
              disabled={disabled}
            >
              <Icon name="add" size={16} aria-hidden />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Icon name="sql" />}
            onClick={() => {
              const mockTransform = createMockTransform({
                source: getSource("sql"),
              });

              addUnsavedTransform(mockTransform.source);
            }}
          >
            {t`SQL Transform`}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="code_block" />}
            onClick={() => {
              const mockTransform = createMockTransform({
                source: getSource("python"),
              });

              addUnsavedTransform(mockTransform.source);
            }}
          >
            {t`Python Script`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </>
  );
};
