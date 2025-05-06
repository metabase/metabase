import { t } from "ttag";

import CustomGeoJSONWidget from "metabase/admin/settings/components/widgets/CustomGeoJSONWidget";
import { color } from "metabase/lib/colors";
import { Card, Divider, Stack, Text, TextInput, Title } from "metabase/ui";

const MapSettingsPage = () => {
  return (
    <Stack gap="2rem">
      <Card p="xl" bg={color("bg-light")} withBorder shadow="none">
        <Title order={2} mb="xs">{t`Map Tile Server`}</Title>
        <Text mb="lg">{t`Configure the map tile server used for rendering maps in visualizations.`}</Text>
        <Divider mb="xl" />
        <TextInput placeholder="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      </Card>

      <Card p="xl" bg={color("bg-light")} withBorder shadow="none">
        <Title order={2} mb="xs">{t`Custom Maps`}</Title>
        <Text mb="lg">
          {t`Add custom GeoJSON files to enable different region map visualizations.`}
        </Text>
        <Divider mb="xl" />
        {/* <CustomGeoJSONWidget /> */}
      </Card>
    </Stack>
  );
};

export { MapSettingsPage };
