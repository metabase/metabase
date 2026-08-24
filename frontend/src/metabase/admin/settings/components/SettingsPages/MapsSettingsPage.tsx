import { t } from "ttag";

import { AdminSettingInput } from "metabase/settings-components/AdminSettingInput";
import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/settings-components/SettingsSection";

import { CustomGeoJSONWidget } from "../widgets/CustomGeoJSONWidget";

export function MapsSettingsPage() {
  return (
    <SettingsPageWrapper title={t`Maps`}>
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
    </SettingsPageWrapper>
  );
}
