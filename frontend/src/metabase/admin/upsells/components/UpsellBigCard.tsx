import { useMount } from "react-use";

import ExternalLink from "metabase/core/components/ExternalLink";
import { Box, Flex, Image, Stack, Text, Title } from "metabase/ui";

import { UpsellGem } from "./UpsellGem";
import { UpsellWrapper } from "./UpsellWrapper";
import S from "./Upsells.module.css";
import { trackUpsellClicked, trackUpsellViewed } from "./analytics";
import { useUpsellLink } from "./use-upsell-link";

export type UpsellBigCardProps = {
  title: string;
  buttonText: string;
  buttonLink: string;
  campaign: string;
  source: string;
  illustrationSrc?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
};

export const _UpsellBigCard: React.FC<UpsellBigCardProps> = ({
  title,
  buttonText,
  buttonLink,
  campaign,
  illustrationSrc,
  source,
  children,
  ...props
}: UpsellBigCardProps) => {
  const url = useUpsellLink({
    url: buttonLink,
    campaign,
    source,
  });

  useMount(() => {
    trackUpsellViewed({ source, campaign });
  });

  return (
    <Box
      data-testid="upsell-big-card"
      className={S.UpsellBigCardComponent}
      {...props}
    >
      <Flex px="xl" py="md">
        <UpsellGem size={24} />
        <Stack align="flex-start" gap={0} ml="0.75rem" maw="18.75rem">
          <Title order={1} lh={1} mb="sm">
            {title}
          </Title>
          <Text lh="lg" mb="lg">
            {children}
          </Text>
          <ExternalLink
            className={S.UpsellCTALink}
            href={url}
            onClickCapture={() => trackUpsellClicked({ source, campaign })}
          >
            {buttonText}
          </ExternalLink>
        </Stack>
      </Flex>
      {illustrationSrc && (
        <Image src={illustrationSrc} p="md" pl={0} w="auto" />
      )}
    </Box>
  );
};

export const UpsellBigCard = UpsellWrapper(_UpsellBigCard);
