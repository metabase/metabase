import { useMemo } from "react";

import type { IconData, IconModel } from "metabase/common/utils/icon";
import { useGetIcon } from "metabase/hooks/use-icon";
import { Anchor, Group, Icon, Text } from "metabase/ui";
import { getSubpathSafeUrl, modelToUrl } from "metabase/urls";
import type { RemoteSyncEntity } from "metabase-types/api";

import { getSyncStatusColor, getSyncStatusIcon } from "../../utils";

import S from "./EntityLink.module.css";

interface EntityLinkProps {
  entity: RemoteSyncEntity;
}

function getEntityUrl(entity: RemoteSyncEntity): string | null {
  // An action URL needs the parent model id, which dirty entries do not carry.
  if (entity.model === "action") {
    return null;
  }
  // A deleted entity has no page left to open.
  if (entity.sync_status === "delete") {
    return null;
  }
  return getSubpathSafeUrl(modelToUrl(entity));
}

export const EntityLink = ({ entity }: EntityLinkProps) => {
  const getIcon = useGetIcon();
  const entityIcon = useMemo((): IconData => {
    if (entity.model === "field") {
      return { name: "field" };
    }

    return getIcon({
      // Unjustified type cast. FIXME
      model: entity.model as IconModel,
      id: entity.id,
      display: entity.display,
    });
  }, [entity, getIcon]);

  const url = useMemo(() => getEntityUrl(entity), [entity]);

  const statusIcon = getSyncStatusIcon(entity.sync_status);
  const statusColor = getSyncStatusColor(entity.sync_status);

  return (
    <Group gap="sm" wrap="nowrap" px="sm" className={S.entityLink}>
      {url != null ? (
        <Anchor
          href={url}
          target="_blank"
          size="sm"
          c="text-secondary"
          td="none"
          classNames={{ root: S.anchor }}
          display="flex"
        >
          <Icon
            name={entityIcon.name}
            size={16}
            mr="sm"
            c="text-secondary"
            className={S.icon}
          />
          {entity.name}
        </Anchor>
      ) : (
        <Text size="sm" c="text-secondary" display="flex">
          <Icon name={entityIcon.name} size={16} mr="sm" c="text-secondary" />
          {entity.name}
        </Text>
      )}
      <Icon name={statusIcon} size={16} c={statusColor} ml="auto" />
    </Group>
  );
};
