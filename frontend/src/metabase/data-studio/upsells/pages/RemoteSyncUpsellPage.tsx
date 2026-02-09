import { t } from "ttag";

import { useUpgradeAction } from "metabase/admin/upsells/components/UpgradeModal";
import { UpsellCta } from "metabase/admin/upsells/components/UpsellCta";
import { UpsellGem } from "metabase/admin/upsells/components/UpsellGem";
import { trackUpsellClicked } from "metabase/admin/upsells/components/analytics";
import { DATA_STUDIO_UPGRADE_URL } from "metabase/admin/upsells/constants";
import { useCheckTrialAvailableQuery } from "metabase/api/cloud-proxy";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { useSelector } from "metabase/lib/redux";
import { getStoreUsers } from "metabase/selectors/store-users";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { getIsHosted } from "metabase/setup";
import {
  Box,
  Card,
  Center,
  Divider,
  Flex,
  Image,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import { DottedBackground } from "../components/DottedBackground";
import { LineDecorator } from "../components/LineDecorator";

import S from "./BaseUpsellPage.module.css";

const CAMPAIGN = "remote-sync";
const LOCATION = "data-studio-remote-sync";

export function RemoteSyncUpsellPage() {
  const { onClick: upgradeOnClick, url: upgradeUrl } = useUpgradeAction({
    url: DATA_STUDIO_UPGRADE_URL,
    campaign: CAMPAIGN,
    location: LOCATION,
  });

  const isHosted = useSelector(getIsHosted);
  const applicationName = useSelector(getApplicationName);
  const { isStoreUser, anyStoreUserEmailAddress } = useSelector(getStoreUsers);

  const { data: trialData, isLoading } = useCheckTrialAvailableQuery();

  if (isLoading) {
    return (
      <DottedBackground px="3.5rem" pb="2rem">
        <PaneHeader
          breadcrumbs={
            <DataStudioBreadcrumbs>{t`Remote sync`}</DataStudioBreadcrumbs>
          }
        />
        <Center h="100%" bg="background-secondary">
          <LoadingAndErrorWrapper loading={isLoading} />
        </Center>
      </DottedBackground>
    );
  }

  const shouldShowContactAdmin = isHosted && !isStoreUser;

  const copy = {
    title: t`Manage your ${applicationName} content in Git`,
    description: t`Keep your most important datasets, metrics, and SQL logic under version control. Sync content to a Git repository to review changes, collaborate, and maintain a production-ready source of truth.`,
  };

  const isTrialAvailable = trialData?.available ?? false;

  return (
    <DottedBackground px="3.5rem" pb="2rem">
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Remote sync`}</DataStudioBreadcrumbs>
        }
      />
      <Stack align="center" p={40}>
        <LineDecorator>
          <Card p={0} w="100%" maw={700} withBorder>
            <Flex direction="row" gap={0}>
              <Box w="100%" p="xl">
                <Flex direction="row" gap="lg">
                  <Stack gap="sm">
                    <Flex align="center" gap="xs">
                      <UpsellGem.New size={16} />
                      {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins. */}
                      <Text c="text-brand">{t`Metabase Pro`}</Text>
                    </Flex>
                    <Title order={2}>{copy.title}</Title>
                    <Stack gap="md" py="sm" mb="sm">
                      <Text c="text-secondary">{copy.description}</Text>
                      {shouldShowContactAdmin && (
                        <Text>
                          {anyStoreUserEmailAddress
                            ? // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
                              t`Please ask a Metabase Store Admin (${anyStoreUserEmailAddress}) to upgrade your plan.`
                            : // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
                              t`Please ask a Metabase Store Admin to upgrade your plan.`}
                        </Text>
                      )}
                      {!isTrialAvailable && (
                        <Text>{t`Get a 14 day free trial of this and other pro features`}</Text>
                      )}
                    </Stack>
                    {!shouldShowContactAdmin && (
                      <Stack align="flex-start">
                        <UpsellCta
                          onClick={upgradeOnClick}
                          url={upgradeUrl}
                          internalLink={undefined}
                          buttonText={
                            isTrialAvailable
                              ? t`Try for free`
                              : t`Upgrade to Pro`
                          }
                          onClickCapture={() =>
                            trackUpsellClicked({
                              location: LOCATION,
                              campaign: CAMPAIGN,
                            })
                          }
                          className={S.UpsellCta}
                          size="large"
                        />
                      </Stack>
                    )}
                  </Stack>
                </Flex>
              </Box>
              <Divider orientation="vertical" />
              <Center w="100%" bg="background-secondary" p={33}>
                <Image
                  src="app/assets/img/data-studio-remote-sync-upsell.svg"
                  w="100%"
                  h="auto"
                />
              </Center>
            </Flex>
          </Card>
        </LineDecorator>
      </Stack>
    </DottedBackground>
  );
}
