import React from "react";
import { t } from "ttag";

import type { LinkEntity, UnrestrictedLinkEntity } from "metabase-types/api";
import { isRestrictedLinkEntity } from "metabase-types/guards/dashboard";

import Ellipsified from "metabase/core/components/Ellipsified";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";
import { isEmpty } from "metabase/lib/validate";

import { EntityDisplayContainer, LeftContainer } from "./EntityDisplay.styled";

export const EntityDisplay = ({
  entity,
  showDescription = false,
}: {
  entity: LinkEntity;
  showDescription?: boolean;
}) => {
  if (entity && isRestrictedLinkEntity(entity)) {
    return (
      <EntityDisplayContainer>
        <LeftContainer>
          <Icon name="key" color={color("text-light")} />
          <Ellipsified>{t`Sorry, you don't have permission to see this link.`}</Ellipsified>
        </LeftContainer>
      </EntityDisplayContainer>
    );
  }

  return (
    <EntityDisplayContainer>
      <LeftContainer>
        <Icon color={color("brand")} name={getSearchIconName(entity)} />
        <Ellipsified>{entity?.name}</Ellipsified>
      </LeftContainer>
      {showDescription && entity?.description && (
        <Icon
          name="info"
          color={color("text-light")}
          tooltip={entity.description}
        />
      )}
    </EntityDisplayContainer>
  );
};

export const UrlLinkDisplay = ({ url }: { url?: string }) => {
  const urlIcon = isEmpty(url) ? "question" : "link";

  return (
    <EntityDisplayContainer>
      <LeftContainer>
        <Icon color={color("brand")} name={urlIcon} />
        <Ellipsified>{!isEmpty(url) ? url : t`Choose a link`}</Ellipsified>
      </LeftContainer>
    </EntityDisplayContainer>
  );
};

function getSearchIconName(entity: UnrestrictedLinkEntity) {
  const entityIcon = entity.getIcon?.() ?? { name: "link" };

  // we need to change this icon to make it match the icon in the search results
  if (entity.model === "table") {
    entityIcon.name = "database";
  }

  return entityIcon.name;
}
