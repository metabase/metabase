import { Link } from "metabase/common/components/Link";
import { Card, Group, Icon, Text } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./RelatedSettingsSection.module.css";

export const RelatedSettingCard = ({
  icon,
  name,
  to,
}: {
  icon: IconName;
  name: string;
  to: string;
}) => {
  return (
    <Card
      component={Link}
      to={to}
      px="lg"
      py="xxs"
      withBorder
      data-testid="related-setting-card"
      shadow="none"
      h="3rem"
      className={S.relatedSettingCard}
    >
      <Group gap="sm" align="center" h="100%">
        <Icon name={icon} c="core-brand" />

        <Text fw={500} ta="center">
          {name}
        </Text>
      </Group>
    </Card>
  );
};
