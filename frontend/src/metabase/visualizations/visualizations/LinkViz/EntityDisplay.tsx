import React from "react";

import Icon from "metabase/components/Icon";
import { ItemIcon } from "metabase/search/components/SearchResult";
import type { SearchEntity } from "metabase-types/api";
import { color } from "metabase/lib/colors";
import Ellipsified from "metabase/core/components/Ellipsified";

import { EntityDisplayContainer, LeftContainer } from "./EntityDisplay.styled";

export const EntityDisplay = ({
  entity,
  showDescription = false,
}: {
  entity: SearchEntity;
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
          tooltip={entity?.description}
        />
      )}
    </EntityDisplayContainer>
  );
};
