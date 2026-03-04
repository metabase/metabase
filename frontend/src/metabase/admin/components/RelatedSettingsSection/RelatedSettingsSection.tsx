import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import {
  Card,
  Group,
  Icon,
  type IconName,
  SimpleGrid,
  Stack,
  Text,
} from "metabase/ui";

import S from "./RelatedSettingsSection.module.css";
import type { RelatedSettingItem } from "./constants";

export function RelatedSettingsSection({
  items,
}: {
  items?: RelatedSettingItem[];
}) {
  return (
    <Stack gap="md">
      <Text size="lg" fw="bold" lh="xs">
        {t`Related settings`}
      </Text>

      <SimpleGrid cols={{ xs: 1, md: 3 }} spacing="md">
        {items?.map((item) => (
          <RelatedSettingCard
            key={item.to}
            icon={item.icon}
            name={item.name}
            to={item.to}
          />
        ))}
      </SimpleGrid>
    </Stack>
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
      className={S.relatedSettingCard}
    >
      <Group gap="sm" align="center" h="100%">
        <Icon name={icon} c="brand" />

        <Text fw={500} ta="center">
          {name}
        </Text>
      </Group>
    </Card>
  );
};
