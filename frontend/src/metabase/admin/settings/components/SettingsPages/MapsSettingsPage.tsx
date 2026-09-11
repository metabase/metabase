import { jt, t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";

import { AdminSettingInput } from "../widgets/AdminSettingInput";
import { CustomGeoJSONWidget } from "../widgets/CustomGeoJSONWidget";

export function MapsSettingsPage() {
  const { url: tileServerDocsUrl } = useDocsUrl(
    "configuring-metabase/custom-maps",
    { anchor: "map-tile-server" },
  );

  return (
    <SettingsPageWrapper title={t`Maps`}>
      <SettingsSection>
        <AdminSettingInput
          name="map-tile-server-url"
          title={t`Map tile server public URL`}
          description={
            <>
              {jt`Public URL of the tile server to use when rendering maps. Defaults to OpenStreetMaps, but you can set a custom URL. This URL is visible to clients, so do not include private keys. ${(
                <ExternalLink key="tile-server-docs" href={tileServerDocsUrl}>
                  {t`Learn more`}
                </ExternalLink>
              )}`}
            </>
          }
          inputType="text"
        />
        <CustomGeoJSONWidget />
      </SettingsSection>
    </SettingsPageWrapper>
  );
}
