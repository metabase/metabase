import { useEffect } from "react";
import { t } from "ttag";

import { UpsellCta } from "metabase/admin/upsells/components/UpsellCta";
import { UpsellGem } from "metabase/admin/upsells/components/UpsellGem";
import {
  trackUpsellClicked,
  trackUpsellViewed,
} from "metabase/admin/upsells/components/analytics";
import { useCheckTrialAvailableQuery } from "metabase/api/cloud-proxy";
import { useSelector } from "metabase/lib/redux";
import { getStoreUsers } from "metabase/selectors/store-users";
import { getIsHosted } from "metabase/setup/selectors";
import {
  Box,
  Card,
  Center,
  Divider,
  Flex,
  Icon,
  Image,
  Stack,
  Text,
  Title,
  rem,
} from "metabase/ui";

import S from "./UpsellCardContent.module.css";

export type UpsellCardContentProps = UpsellCardLeftColumnContentProps & {
  image?: string;
  variant?: "image-full-height" | "image-card";
};

export const UpsellCardContent = ({
  campaign,
  location,
  title,
  description,
  bulletPoints,
  image,
  upgradeOnClick,
  upgradeUrl,
  variant = "image-card",
}: UpsellCardContentProps) => {
  const { data: trialData } = useCheckTrialAvailableQuery();
  const isTrialAvailable = trialData?.available ?? false;

  const leftSideSize = rem(280);
  const maxWidth = image ? 700 : 450;
  const contentPadding = rem(48);

  useEffect(() => {
    trackUpsellViewed({ location, campaign });
  }, [location, campaign]);

  if (variant === "image-full-height") {
    return (
      <Card p={0} w={maxWidth} withBorder>
        <Flex direction="row" gap={0}>
          <Box w="100%" p={contentPadding}>
            <Flex w={leftSideSize} direction="row" gap="lg">
              <UpsellCardLeftColumnContent
                campaign={campaign}
                location={location}
                title={title}
                description={description}
                bulletPoints={bulletPoints}
                upgradeOnClick={upgradeOnClick}
                upgradeUrl={upgradeUrl}
                isTrialAvailable={isTrialAvailable}
              />
            </Flex>
          </Box>
          <Divider orientation="vertical" />
          <Center w="100%" bg="background-secondary" p={33}>
            <Image src={image} w="100%" h="auto" />
          </Center>
        </Flex>
      </Card>
    );
  }

  return (
    <Card shadow="md" p={contentPadding} w={maxWidth} withBorder>
      <Flex direction="row" gap="lg">
        <Box w={leftSideSize} flex="0 0 auto">
          <UpsellCardLeftColumnContent
            campaign={campaign}
            location={location}
            title={title}
            description={description}
            bulletPoints={bulletPoints}
            upgradeOnClick={upgradeOnClick}
            upgradeUrl={upgradeUrl}
            isTrialAvailable={isTrialAvailable}
          />
        </Box>
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
  );
};

type UpsellCardLeftColumnContentProps = {
  campaign: string;
  location: string;
  title: string;
  description: string;
  bulletPoints?: string[];
  upgradeOnClick: (() => void) | undefined;
  upgradeUrl: string | undefined;
};

const UpsellCardLeftColumnContent = ({
  campaign,
  location,
  title,
  description,
  bulletPoints,
  upgradeOnClick,
  upgradeUrl,
  isTrialAvailable,
}: UpsellCardLeftColumnContentProps & {
  isTrialAvailable: boolean;
}) => {
  const isHosted = useSelector(getIsHosted);
  const { isStoreUser, anyStoreUserEmailAddress } = useSelector(getStoreUsers);

  const shouldShowContactAdmin = isHosted && !isStoreUser;

  return (
    <Stack gap="sm" w="100%">
      <Flex align="center" gap="xs">
        <UpsellGem.New size={16} />
        {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins. */}
        <Text c="text-brand">{t`Metabase Pro`}</Text>
      </Flex>
      <Stack gap="md" py="sm" mb="sm">
        <Title order={3}>{title}</Title>
        <Text c="text-secondary" lh={1.4} p={0}>
          {description}
        </Text>
        {bulletPoints && (
          <Stack gap="lg" py="sm">
            {bulletPoints?.map((point) => (
              <Flex direction="row" gap="sm" key={point}>
                <Center w={24} h={24}>
                  <Icon name="check_filled" size={16} c="text-brand" />
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
            buttonText={isTrialAvailable ? t`Try for free` : t`Upgrade to Pro`}
            onClickCapture={() => trackUpsellClicked({ location, campaign })}
            className={S.UpsellCta}
            size="large"
          />
        </Stack>
      )}
    </Stack>
  );
};
