import React from "react";
import { t } from "ttag";

import type { LinkEntity } from "metabase-types/api";
import { isRestrictedLinkEntity } from "metabase-types/guards/dashboard";

import Ellipsified from "metabase/core/components/Ellipsified";
import Icon from "metabase/components/Icon";
import { ItemIcon } from "metabase/search/components/SearchResult";

import { color } from "metabase/lib/colors";

import {
  EntityDisplayContainer,
  LeftContainer,
  IconWithHorizontalMargin,
} from "./EntityDisplay.styled";

export const EntityDisplay = ({
  entity,
  showDescription = false,
}: {
  entity: LinkEntity;
  showDescription?: boolean;
}) => {
  if (isRestrictedLinkEntity(entity)) {
    return (
      <EntityDisplayContainer>
        <LeftContainer>
          <IconWithHorizontalMargin name="key" color={color("text-light")} />
          <Ellipsified>{t`Sorry, you don't have permission to see this link.`}</Ellipsified>
        </LeftContainer>
      </EntityDisplayContainer>
    );
  }

  return (
    <EntityDisplayContainer>
      <LeftContainer>
        <ItemIcon item={entity} type={entity?.model} active />
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
