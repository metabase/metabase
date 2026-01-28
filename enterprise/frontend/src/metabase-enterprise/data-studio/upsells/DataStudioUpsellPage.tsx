import { useEffect } from "react";
import { t } from "ttag";

import { UpsellCta } from "metabase/admin/upsells/components/UpsellCta";
import { UpsellGem } from "metabase/admin/upsells/components/UpsellGem";
import {
  trackUpsellClicked,
  trackUpsellViewed,
} from "metabase/admin/upsells/components/analytics";
import { useUpsellLink } from "metabase/admin/upsells/components/use-upsell-link";
import { useStoreUrl } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
import { getStoreUsers } from "metabase/selectors/store-users";
import { getIsHosted } from "metabase/setup/selectors";
import { Card, Center, Flex, Stack, Text, Title } from "metabase/ui";

import { DATA_STUDIO_UPGRADE_URL } from "./constants";

export type DataStudioUpsellPageProps = {
  campaign: string;
  location: string;
  title: string;
  description: string;
};

export function DataStudioUpsellPage({
  campaign,
  location,
  title,
  description,
}: DataStudioUpsellPageProps) {
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location,
  });
  const isHosted = useSelector(getIsHosted);
  const { isStoreUser, anyStoreUserEmailAddress } = useSelector(getStoreUsers);

  const genericUpsellUrl = useUpsellLink({
    url: DATA_STUDIO_UPGRADE_URL,
    campaign,
    location,
  });
  const storeManagePlansUrl = useStoreUrl("account/manage/plans");

  useEffect(() => {
    trackUpsellViewed({ location, campaign });
  }, [location, campaign]);

  const shouldShowContactAdmin = isHosted && !isStoreUser;

  const getUpsellUrl = () => {
    if (isHosted && isStoreUser) {
      return storeManagePlansUrl;
    }
    return genericUpsellUrl;
  };

  return (
    <Center h="100%" bg="background-secondary">
      <Card shadow="md" p="xl" maw={500} withBorder>
        <Stack gap="md">
          <Flex align="center" gap="xs">
            <UpsellGem size={16} />
            {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins. */}
            <Text c="text-primary">{t`Metabase Pro`}</Text>
          </Flex>
          <Title order={2}>{title}</Title>
          <Text c="text-primary">{description}</Text>
          {shouldShowContactAdmin ? (
            <Text fw="bold" mt="lg">
              {anyStoreUserEmailAddress
                ? // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
                  t`Please ask a Metabase Store Admin (${anyStoreUserEmailAddress}) to upgrade your plan.`
                : // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
                  t`Please ask a Metabase Store Admin to upgrade your plan.`}
            </Text>
          ) : (
            <>
              <Text mt="lg">{t`Get a 14 day free trial of this and other pro features`}</Text>
              <Stack align="center" mt="md">
                <UpsellCta
                  onClick={triggerUpsellFlow}
                  url={getUpsellUrl()}
                  internalLink={undefined}
                  buttonText={t`Upgrade to Pro`}
                  onClickCapture={() =>
                    trackUpsellClicked({ location, campaign })
                  }
                  size="large"
                />
              </Stack>
            </>
          )}
        </Stack>
      </Card>
    </Center>
  );
}
