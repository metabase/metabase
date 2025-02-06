import { useMount } from "react-use";

import { Box, Flex, Image, Stack, Text, Title } from "metabase/ui";

import S from "./UpsellCard.module.css";
import { UpsellGem } from "./UpsellGem";
import { UpsellWrapper } from "./UpsellWrapper";
import C from "./Upsells.module.css";
import { UpsellCTALink } from "./Upsells.styled";
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
      className={C.UpsellBigCardComponent}
      {...props}
    >
      <Flex px="md">
        <UpsellGem size={24} />
        <Stack spacing={0} ml="0.75rem">
          <Title order={1} lh="lg" mb="sm">
            {title}
          </Title>
          <Text lh="lg" mb="lg">
            {children}
          </Text>
          <Box
            component={UpsellCTALink}
            onClickCapture={() => trackUpsellClicked({ source, campaign })}
            href={url}
            className={S.UpsellCTALink}
            py="0.75rem"
            px="md"
            style={{ fontSize: "0.875rem", alignSelf: "flex-start" }}
          >
            {buttonText}
          </Box>
        </Stack>
      </Flex>
      {illustrationSrc && <Image src={illustrationSrc} w="100%" />}
    </Box>
  );
};

export const UpsellBigCard = UpsellWrapper(_UpsellBigCard);
