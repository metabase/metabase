import { t } from "ttag";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import { Markdown } from "metabase/common/components/Markdown";
import { useGetIcon } from "metabase/hooks/use-icon";
import { Icon } from "metabase/ui";
import type { IconData } from "metabase/utils/icon";
import { isEmpty } from "metabase/utils/validate";
import type { UnrestrictedLinkEntity } from "metabase-types/api";

import {
  EllipsifiedEntityContainer,
  EntityDisplayContainer,
  LeftContainer,
} from "./EntityDisplay.styled";

export const EntityDisplay = ({
  entity,
  showDescription = false,
}: {
  entity: UnrestrictedLinkEntity;
  showDescription?: boolean;
}) => {
  const getIcon = useGetIcon();

  const getSearchIcon = (entity: UnrestrictedLinkEntity): IconData => {
    const entityIcon = getIcon(entity) ?? { name: "link" as const };
    if (entity.model === "table") {
      entityIcon.name = "database";
    }
    return entityIcon;
  };

  return (
    <EntityDisplayContainer>
      <LeftContainer>
        <EntityIcon color="brand" {...getSearchIcon(entity)} />
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
