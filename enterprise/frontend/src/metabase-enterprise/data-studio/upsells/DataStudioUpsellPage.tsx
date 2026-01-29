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
import {
  Box,
  Card,
  Center,
  DottedBackground,
  Flex,
  Icon,
  Image,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import { DataStudioBreadcrumbs } from "../common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "../common/components/PaneHeader";

import S from "./DataStudioUpsellPage.module.css";
import { DATA_STUDIO_UPGRADE_URL } from "./constants";

export type DataStudioUpsellPageProps = {
  campaign: string;
  location: string;
  header: string;
  title: string;
  description: string;
  bulletPoints?: string[];
  image?: string;
};

export function DataStudioUpsellPage({
  campaign,
  location,
  header,
  title,
  description,
  bulletPoints,
  image,
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

  const maxWidth = image ? 700 : 450;

  return (
    <DottedBackground px="3.5rem" pb="2rem">
      <PaneHeader
        breadcrumbs={<DataStudioBreadcrumbs>{header}</DataStudioBreadcrumbs>}
      />
      <Stack align="center" p={40}>
        <Box className={S.Card}>
          {["top", "right", "bottom", "left"].map((position) => (
            <Box key={position} className={S.Border} data-position={position} />
          ))}
          <Card shadow="md" p="xl" maw={maxWidth} withBorder>
            <Flex direction="row" gap="lg">
              <Stack gap="sm">
                <Flex align="center" gap="xs">
                  <UpsellGem.New size={16} />
                  {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins. */}
                  <Text c="text-brand">{t`Metabase Pro`}</Text>
                </Flex>
                <Title order={2}>{title}</Title>
                <Stack gap="md" py="sm" mb="sm">
                  <Text c="text-secondary">{description}</Text>
                  {bulletPoints && (
                    <Stack gap="lg" py="sm">
                      {bulletPoints?.map((point) => (
                        <Flex direction="row" gap="sm" key={point}>
                          <Center w={24} h={24}>
                            <Icon
                              name="check_filled"
                              size={16}
                              c="text-brand"
                            />
                          </Center>
                          <Text c="text-secondary">{point}</Text>
                        </Flex>
                      ))}
                    </Stack>
                  )}
                  {shouldShowContactAdmin ? (
                    <Text>
                      {anyStoreUserEmailAddress
                        ? // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
                          t`Please ask a Metabase Store Admin (${anyStoreUserEmailAddress}) to upgrade your plan.`
                        : // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
                          t`Please ask a Metabase Store Admin to upgrade your plan.`}
                    </Text>
                  ) : (
                    <Text>{t`Get a 14 day free trial of this and other pro features`}</Text>
                  )}
                </Stack>
                {!shouldShowContactAdmin && (
                  <Stack align="flex-start">
                    <UpsellCta
                      onClick={triggerUpsellFlow}
                      url={getUpsellUrl()}
                      internalLink={undefined}
                      buttonText={t`Upgrade to Pro`}
                      onClickCapture={() =>
                        trackUpsellClicked({ location, campaign })
                      }
                      className={S.UpsellCta}
                      size="large"
                    />
                  </Stack>
                )}
              </Stack>
              {image && (
                <Card
                  className={S.ImageCard}
                  p={6}
                  radius={12}
                  shadow="md"
                  withBorder
                  maw="50%"
                >
                  <Card radius={6} p={0} shadow="none" withBorder>
                    <Image src={image} radius={6} w="100%" />
                  </Card>
                </Card>
              )}
            </Flex>
          </Card>
        </Box>
      </Stack>
    </DottedBackground>
  );
}
