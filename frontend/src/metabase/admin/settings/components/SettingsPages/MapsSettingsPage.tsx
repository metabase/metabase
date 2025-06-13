import { t } from "ttag";

import { Stack, Title } from "metabase/ui";

import { SettingsSection } from "../SettingsSection";
import { AdminSettingInput } from "../widgets/AdminSettingInput";
import { CustomGeoJSONWidget } from "../widgets/CustomGeoJSONWidget";

export function MapsSettingsPage() {
  return (
    <Stack>
      <Title order={1}>{t`Maps`}</Title>
      <SettingsSection>
        <AdminSettingInput
          name="map-tile-server-url"
          title={t`Map tile server URL`}
          description={
            <>
              <div>
                {t`URL of the map tile server to use for rendering maps. If you're using a custom map tile server, you can set it here.`}
              </div>
              <div>{t`Metabase uses OpenStreetMaps by default.`}</div>
            </>
          }
          inputType="text"
        />
        <CustomGeoJSONWidget />
      </SettingsSection>
    </Stack>
  );
}
