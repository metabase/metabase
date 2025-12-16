import { Fragment } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { Anchor, Box, Card, Group, Icon, Stack, Title } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getNodeLocationInfo } from "../../../utils";

type LocationSectionProps = {
  node: DependencyNode;
};

export function LocationSection({ node }: LocationSectionProps) {
  const locationInfo = getNodeLocationInfo(node);
  if (locationInfo == null) {
    return null;
  }

  return (
    <Stack gap="sm">
      <Title order={4}>{t`Location`}</Title>
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
