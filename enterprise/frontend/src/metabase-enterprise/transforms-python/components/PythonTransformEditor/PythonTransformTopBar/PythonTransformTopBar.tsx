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
      align="flex-start"
      bg="background-secondary"
      data-testid="python-transform-top-bar"
      className={S.TopBar}
    >
      <Flex
        h="3rem"
        p="md"
        ml="sm"
        align="center"
        data-testid="selected-database"
      >
        {database?.name}
      </Flex>
      {readOnly && transformId && (
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
