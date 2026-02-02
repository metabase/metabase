import { t } from "ttag";

import { UpsellCta } from "metabase/admin/upsells/components/UpsellCta";
import { UpsellGem } from "metabase/admin/upsells/components/UpsellGem";
import { trackUpsellClicked } from "metabase/admin/upsells/components/analytics";
import { useUpsellLink } from "metabase/admin/upsells/components/use-upsell-link";
import { useStoreUrl } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
import { getStoreUsers } from "metabase/selectors/store-users";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { getIsHosted } from "metabase/setup";
import {
  Box,
  Card,
  Center,
  Divider,
  DottedBackground,
  Flex,
  Image,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import { DataStudioBreadcrumbs } from "../common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "../common/components/PaneHeader";

import S from "./DataStudioUpsellPage.module.css";
import { LineDecorator } from "./LineDecorator";
import { DATA_STUDIO_UPGRADE_URL } from "./constants";

const CAMPAIGN = "remote-sync";
const LOCATION = "data-studio-remote-sync";

export function RemoteSyncUpsellPage() {
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign: CAMPAIGN,
    location: LOCATION,
  });

  const isHosted = useSelector(getIsHosted);
  const applicationName = useSelector(getApplicationName);
  const { isStoreUser, anyStoreUserEmailAddress } = useSelector(getStoreUsers);

  const genericUpsellUrl = useUpsellLink({
    url: DATA_STUDIO_UPGRADE_URL,
    campaign: CAMPAIGN,
    location: LOCATION,
  });
  const storeManagePlansUrl = useStoreUrl("account/manage/plans");

  const getUpsellUrl = () => {
    if (isHosted && isStoreUser) {
      return storeManagePlansUrl;
    }
    return genericUpsellUrl;
  };

  const shouldShowContactAdmin = isHosted && !isStoreUser;

  const copy = {
    title: t`Manage your ${applicationName} content in Git`,
    description: t`Keep your most important datasets, metrics, and SQL logic under version control. Sync content to a Git repository to review changes, collaborate, and maintain a production-ready source of truth.`,
    // trialUpCta:
  };

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
