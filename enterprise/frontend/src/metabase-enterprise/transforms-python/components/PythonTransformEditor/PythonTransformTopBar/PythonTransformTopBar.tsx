import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { Flex } from "metabase/ui";
import { EditDefinitionButton } from "metabase-enterprise/transforms/components/TransformEditor/EditDefinitionButton";
import type { DatabaseId, TransformId } from "metabase-types/api";

import S from "./PythonTransformTopBar.module.css";

type PythonTransformTopBarProps = {
  databaseId?: DatabaseId;
  readOnly?: boolean;
  transformId?: TransformId;
};

export function PythonTransformTopBar({
  databaseId,
  readOnly,
  transformId,
}: PythonTransformTopBarProps) {
  const { data: database } = useGetDatabaseQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );

  return (
    <Flex
      align="center"
      justify="space-between"
      h="3rem"
      px="md"
      bg="background-secondary"
      data-testid="python-transform-top-bar"
      className={S.TopBar}
    >
      <Flex align="center" fw="bold" data-testid="selected-database">
        {database?.name}
      </Flex>
      {readOnly && transformId && (
        <EditDefinitionButton
          bg="transparent"
          fz="sm"
          h="1.5rem"
          px="sm"
          size="xs"
          transformId={transformId}
        />
      )}
    </Flex>
  );
}
