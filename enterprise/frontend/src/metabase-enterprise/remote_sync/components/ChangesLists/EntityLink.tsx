import { useMemo } from "react";

import { type IconData, type IconModel, getIcon } from "metabase/lib/icon";
import { modelToUrl } from "metabase/lib/urls";
import { Anchor, Group, Icon } from "metabase/ui";
import type { RemoteSyncEntity } from "metabase-types/api";

import { getSyncStatusColor, getSyncStatusIcon } from "../../utils";

import S from "./EntityLink.module.css";

interface EntityLinkProps {
  entity: RemoteSyncEntity;
}

export const EntityLink = ({ entity }: EntityLinkProps) => {
  const entityIcon = useMemo((): IconData => {
    if (entity.model === "field") {
      return { name: "field" };
    }

    return getIcon({
      model: entity.model as IconModel,
      id: entity.id,
      display: entity.display,
    });
  }, [entity]);

  const url = useMemo(() => modelToUrl(entity), [entity]);
  if (url == null) {
    return null;
  }

  const statusIcon = getSyncStatusIcon(entity.sync_status);
  const statusColor = getSyncStatusColor(entity.sync_status);

  return (
    <Group gap="sm" wrap="nowrap" px="sm" className={S.entityLink}>
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
      <Icon name={statusIcon} size={16} c={statusColor} ml="auto" />
    </Group>
  );
};
