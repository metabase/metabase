import { t } from "ttag";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import { Markdown } from "metabase/common/components/Markdown";
import type { IconData } from "metabase/common/utils/icon";
import { useGetIcon } from "metabase/hooks/use-icon";
import { Ellipsified, Flex, Icon } from "metabase/ui";
import { isEmpty } from "metabase/utils/validate";
import type { UnrestrictedLinkEntity } from "metabase-types/api";

type EntityRowProps = {
  icon: React.ReactNode;
  children: React.ReactNode;
  info?: React.ReactNode;
};

const EntityRow = ({ icon, children, info }: EntityRowProps) => (
  <Flex w="100%" align="center" justify="space-between" gap="sm">
    <Flex w="100%" miw={0} align="center" gap="sm">
      {icon}
      <Ellipsified flex={1}>{children}</Ellipsified>
    </Flex>
    {info}
  </Flex>
);

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
    <EntityRow
      icon={<EntityIcon color="core-brand" {...getSearchIcon(entity)} />}
      info={
        showDescription &&
        entity?.description && (
          <Icon
            name="info"
            c="text-secondary"
            tooltip={
              <Markdown dark compact disallowHeading unstyleLinks lineClamp={8}>
                {entity.description}
              </Markdown>
            }
          />
        )
      }
    >
      {entity?.name}
    </EntityRow>
  );
};

export const RestrictedEntityDisplay = () => (
  <EntityRow icon={<Icon name="key" c="text-secondary" />}>
    {t`Sorry, you don't have permission to see this link.`}
  </EntityRow>
);

export const UrlLinkDisplay = ({ url }: { url?: string }) => {
  // show a question mark icon for the empty state
  const urlIcon = isEmpty(url) ? "question" : "link";

  return (
    <EntityRow icon={<Icon c="core-brand" name={urlIcon} />}>
      {!isEmpty(url) ? url : t`Choose a link`}
    </EntityRow>
  );
};
