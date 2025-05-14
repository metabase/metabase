import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { Stack, Text } from "metabase/ui";

import { AdminSettingInput } from "../widgets/AdminSettingInput";
import CustomGeoJSONWidget from "../widgets/CustomGeoJSONWidget";
import {
  PublicLinksActionListing,
  PublicLinksDashboardListing,
  PublicLinksQuestionListing,
} from "../widgets/PublicLinksListing";

export function MapsSettingsPage() {
  const publicSharingEnabled = useSetting("enable-public-sharing");
  return (
    <Stack gap="xl" p="2rem 2rem 2rem 1rem">
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
      {publicSharingEnabled && (
        <Stack gap="xl">
          <Stack gap="sm">
            <Text c="text-medium" fw="bold" tt="uppercase" display="block">
              {t`Shared Dashboards`}
            </Text>

            <PublicLinksDashboardListing />
          </Stack>
          <Stack gap="sm">
            <Text c="text-medium" fw="bold" tt="uppercase" display="block">
              {t`Shared Questions`}
            </Text>

            <PublicLinksQuestionListing />
          </Stack>
          <Stack gap="sm">
            <Text c="text-medium" fw="bold" tt="uppercase" display="block">
              {t`Shared Action Forms`}
            </Text>
            <PublicLinksActionListing />
          </Stack>
        </Stack>
      )}
    </Stack>
  );
}
