import React from "react";

import type { LinkEntity } from "metabase-types/api";

import Ellipsified from "metabase/core/components/Ellipsified";
import Icon from "metabase/components/Icon";
import { ItemIcon } from "metabase/search/components/SearchResult";

import { color } from "metabase/lib/colors";

import { EntityDisplayContainer, LeftContainer } from "./EntityDisplay.styled";

export const EntityDisplay = ({
  entity,
  showDescription = false,
}: {
  entity: LinkEntity;
  showDescription?: boolean;
}) => {
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
