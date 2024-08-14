import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { isEmpty } from "metabase/lib/validate";
import { Icon } from "metabase/ui";

import {
  EllipsifiedEntityContainer,
  EntityDisplayContainer,
  LeftContainer,
} from "./EntityDisplay.styled";
import type { WrappedUnrestrictedLinkEntity } from "./types";

export const EntityDisplay = ({
  entity,
  showDescription = false,
}: {
  entity: WrappedUnrestrictedLinkEntity;
  showDescription?: boolean;
}) => {
  return (
    <EntityDisplayContainer>
      <LeftContainer>
        <Icon color={color("brand")} name={getSearchIconName(entity)} />
        <EllipsifiedEntityContainer>{entity?.name}</EllipsifiedEntityContainer>
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

export const RestrictedEntityDisplay = () => (
  <EntityDisplayContainer>
    <LeftContainer>
      <Icon name="key" color={color("text-light")} />
      <EllipsifiedEntityContainer>{t`Sorry, you don't have permission to see this link.`}</EllipsifiedEntityContainer>
    </LeftContainer>
  </EntityDisplayContainer>
);

export const UrlLinkDisplay = ({ url }: { url?: string }) => {
  // show a question mark icon for the empty state
  const urlIcon = isEmpty(url) ? "question" : "link";

  return (
    <EntityDisplayContainer>
      <LeftContainer>
        <Icon color={color("brand")} name={urlIcon} />
        <EllipsifiedEntityContainer>
          {!isEmpty(url) ? url : t`Choose a link`}
        </EllipsifiedEntityContainer>
      </LeftContainer>
    </EntityDisplayContainer>
  );
};

function getSearchIconName(entity: WrappedUnrestrictedLinkEntity) {
  const entityIcon = entity.getIcon?.() ?? { name: "link" };

  // we need to change this icon to make it match the icon in the search results
  if (entity.model === "table") {
    entityIcon.name = "database";
  }

  return entityIcon.name;
}
