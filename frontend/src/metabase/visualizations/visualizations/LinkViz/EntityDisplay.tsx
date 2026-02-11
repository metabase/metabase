import { t } from "ttag";

import Markdown from "metabase/common/components/Markdown";
import { getIcon } from "metabase/lib/icon";
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
        <Icon c="brand" name={getSearchIconName(entity)} />
        <EllipsifiedEntityContainer>{entity?.name}</EllipsifiedEntityContainer>
      </LeftContainer>
      {showDescription && entity?.description && (
        <Icon
          name="info"
          c="text-tertiary"
          tooltip={
            <Markdown dark disallowHeading unstyleLinks lineClamp={8}>
              {entity.description}
            </Markdown>
          }
        />
      )}
    </EntityDisplayContainer>
  );
};

export const RestrictedEntityDisplay = () => (
  <EntityDisplayContainer>
    <LeftContainer>
      <Icon name="key" c="text-tertiary" />
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
        <Icon c={"brand"} name={urlIcon} />
        <EllipsifiedEntityContainer>
          {!isEmpty(url) ? url : t`Choose a link`}
        </EllipsifiedEntityContainer>
      </LeftContainer>
    </EntityDisplayContainer>
  );
};

function getSearchIconName(entity: WrappedUnrestrictedLinkEntity) {
  const entityIcon = getIcon(entity) ?? { name: "link" };

  // we need to change this icon to make it match the icon in the search results
  if (entity.model === "table") {
    entityIcon.name = "database";
  }

  return entityIcon.name;
}
