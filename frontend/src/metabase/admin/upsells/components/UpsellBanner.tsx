import { useMount } from "react-use";

import { Box, Flex, Text, Title } from "metabase/ui";

import S from "./UpsellCard.module.css";
import { UpsellGem } from "./UpsellGem";
import { UpsellWrapper } from "./UpsellWrapper";
import C from "./Upsells.module.css";
import { UpsellCTALink } from "./Upsells.styled";
import { trackUpsellClicked, trackUpsellViewed } from "./analytics";
import { useUpsellLink } from "./use-upsell-link";

export type UpsellBannerProps = {
  title: string;
  buttonText: string;
  buttonLink: string;
  campaign: string;
  source: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
};

export const _UpsellBanner: React.FC<UpsellBannerProps> = ({
  title,
  buttonText,
  buttonLink,
  campaign,
  source,
  children,
  ...props
}: UpsellBannerProps) => {
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
      className={C.UpsellBannerComponent}
      data-testid="upsell-banner"
      {...props}
    >
      <Flex align="center" gap="md" wrap="nowrap">
        <UpsellGem />
        <Box>
          <Title lh={1.25} order={2} size="md">
            {title}
          </Title>
          <Text lh="1rem" size="sm">
            {children}
          </Text>
        </Box>
      </Flex>

      <Box
        component={UpsellCTALink}
        onClickCapture={() => trackUpsellClicked({ source, campaign })}
        href={url}
        className={S.UpsellCTALink}
        style={{ flexShrink: 0 }}
      >
        {buttonText}
      </Box>
    </Box>
  );
};

export const UpsellBanner = UpsellWrapper(_UpsellBanner);
