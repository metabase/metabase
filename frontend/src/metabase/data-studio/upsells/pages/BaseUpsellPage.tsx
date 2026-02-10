import { useEffect } from "react";
import { t } from "ttag";

import { useUpgradeAction } from "metabase/admin/upsells/components/UpgradeModal";
import { UpsellCta } from "metabase/admin/upsells/components/UpsellCta";
import { UpsellGem } from "metabase/admin/upsells/components/UpsellGem";
import {
  trackUpsellClicked,
  trackUpsellViewed,
} from "metabase/admin/upsells/components/analytics";
import { DATA_STUDIO_UPGRADE_URL } from "metabase/admin/upsells/constants";
import { useCheckTrialAvailableQuery } from "metabase/api/cloud-proxy";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { useSelector } from "metabase/lib/redux";
import { getStoreUsers } from "metabase/selectors/store-users";
import { getIsHosted } from "metabase/setup/selectors";
import {
  Card,
  Center,
  Flex,
  Icon,
  Image,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import { DottedBackground } from "../components/DottedBackground";
import { LineDecorator } from "../components/LineDecorator";

import S from "./BaseUpsellPage.module.css";

export type BaseUpsellPageProps = {
  campaign: string;
  location: string;
  header: string;
  title: string;
  description: string;
  bulletPoints?: string[];
  image?: string;
};

export function BaseUpsellPage({
  campaign,
  location,
  header,
  title,
  description,
  bulletPoints,
  image,
}: BaseUpsellPageProps) {
  const { onClick: upgradeOnClick, url: upgradeUrl } = useUpgradeAction({
    url: DATA_STUDIO_UPGRADE_URL,
    campaign,
    location,
  });

  const isHosted = useSelector(getIsHosted);
  const { isStoreUser, anyStoreUserEmailAddress } = useSelector(getStoreUsers);
  const { data: trialData, isLoading } = useCheckTrialAvailableQuery();

  useEffect(() => {
    trackUpsellViewed({ location, campaign });
  }, [location, campaign]);

  if (isLoading) {
    return (
      <DottedBackground px="3.5rem" pb="2rem">
        <PaneHeader
          breadcrumbs={<DataStudioBreadcrumbs>{header}</DataStudioBreadcrumbs>}
        />
        <Center h="100%" bg="background-secondary">
          <LoadingAndErrorWrapper loading={isLoading} />
        </Center>
      </DottedBackground>
    );
  }

  const shouldShowContactAdmin = isHosted && !isStoreUser;
  const maxWidth = image ? 700 : 450;
  const isTrialAvailable = trialData?.available ?? false;

  return (
    <DottedBackground px="3.5rem" pb="2rem">
      <PaneHeader
        breadcrumbs={<DataStudioBreadcrumbs>{header}</DataStudioBreadcrumbs>}
      />
      <Stack align="center" p={40} className={S.UpsellPageContent}>
        <LineDecorator>
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
                  {shouldShowContactAdmin && (
                    <Text>
                      {anyStoreUserEmailAddress
                        ? // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
                          t`Please ask a Metabase Store Admin (${anyStoreUserEmailAddress}) to upgrade your plan.`
                        : // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
                          t`Please ask a Metabase Store Admin to upgrade your plan.`}
                    </Text>
                  )}
                  {isTrialAvailable && (
                    <Text>{t`Get a 14-day free trial of this and other pro features`}</Text>
                  )}
                </Stack>
                {!shouldShowContactAdmin && (
                  <Stack align="flex-start">
                    <UpsellCta
                      onClick={upgradeOnClick}
                      url={upgradeUrl}
                      internalLink={undefined}
                      buttonText={
                        isTrialAvailable ? t`Try for free` : t`Upgrade to Pro`
                      }
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
        </LineDecorator>
      </Stack>
    </DottedBackground>
  );
}
