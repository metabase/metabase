import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";

import { AdminSettingInput } from "../widgets/AdminSettingInput";
import { CustomGeoJSONWidget } from "../widgets/CustomGeoJSONWidget";

export function MapsSettingsPage() {
  return (
    <SettingsPageWrapper title={t`Maps`}>
      <SettingsSection>
        <AdminSettingInput
          name="map-tile-server-url"
          title={t`Map tile server public URL`}
          description={t`Public URL of the tile server to use when rendering maps. Defaults to OpenStreetMap, but you can set a custom URL. This URL is visible to clients, so do not include private keys.`}
          inputType="text"
        />
        <CustomGeoJSONWidget />
      </SettingsSection>
    </SettingsPageWrapper>
  );
}
