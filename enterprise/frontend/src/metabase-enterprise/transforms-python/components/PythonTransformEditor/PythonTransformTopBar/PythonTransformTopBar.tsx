import { useSelector } from "metabase/lib/redux";
import { EditDefinitionButton } from "metabase/transforms/components/TransformEditor/EditDefinitionButton";
import { Flex } from "metabase/ui";
import { EditTransformMenu } from "metabase-enterprise/data-studio/workspaces/components/EditTransformMenu";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type { Transform } from "metabase-types/api";

import S from "./PythonTransformTopBar.module.css";

type PythonTransformTopBarProps = {
  isEditMode?: boolean;
  readOnly?: boolean;
  transform?: Transform;
};

export function PythonTransformTopBar({
  isEditMode,
  readOnly,
  transform,
}: PythonTransformTopBarProps) {
  const isRemoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);
  const showEditButton =
    !isEditMode && transform && !isRemoteSyncReadOnly && !readOnly;

  if (!showEditButton) {
    return null;
  }

  return (
    <Flex
      align="flex-start"
      bg="background-secondary"
      data-testid="python-transform-top-bar"
      className={S.TopBar}
    >
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
