import { Fragment } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { Anchor, Box, Card, Group, Icon, Stack, Title } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getNodeLocationInfo } from "../../../../utils";

type SidebarLocationInfoProps = {
  node: DependencyNode;
};

export function SidebarLocationInfo({ node }: SidebarLocationInfoProps) {
  const title = t`Location`;
  const locationInfo = getNodeLocationInfo(node);

  if (locationInfo == null) {
    return null;
  }

  return (
    <Stack gap="sm" role="region" aria-label={title}>
      <Title order={4}>{title}</Title>
      <Card p="md" shadow="none" withBorder>
        {locationInfo.links.map((link, linkIndex) => (
          <Fragment key={linkIndex}>
            {linkIndex > 0 && <Box>/</Box>}
            <Anchor component={Link} to={link.url}>
              <Group gap="sm" wrap="nowrap">
                {linkIndex === 0 && <Icon name={locationInfo.icon} />}
                {link.label}
              </Group>
            </Anchor>
          </Fragment>
        ))}
      </Card>
    </Stack>
  );
}
