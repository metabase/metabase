import Link from "metabase/common/components/Link";
import {
  Card,
  Group,
  Icon,
  type IconName,
  SimpleGrid,
  Text,
} from "metabase/ui";

import type { RelatedSettingItem } from "./constants";

export function RelatedSettingsSection({
  items,
}: {
  items?: RelatedSettingItem[];
}) {
  return (
    <SimpleGrid cols={3} spacing="md">
      {items?.map((item) => (
        <RelatedSettingCard
          key={item.to}
          icon={item.icon}
          name={item.name}
          to={item.to}
        />
      ))}
    </SimpleGrid>
  );
}

const RelatedSettingCard = ({
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
      px="md"
      py="xs"
      withBorder
      data-testid="related-setting-card"
      shadow="none"
      h="3rem"
    >
      <Group gap="sm" align="center" h="100%">
        <Icon name={icon} color="var(--mb-color-brand)" />

        <Text fw={500} ta="center">
          {name}
        </Text>
      </Group>
    </Card>
  );
};
