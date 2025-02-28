import { useMount } from "react-use";

import ExternalLink from "metabase/core/components/ExternalLink";
import { Box, Flex, Text, Title } from "metabase/ui";

import { UpsellGem } from "./UpsellGem";
import { UpsellWrapper } from "./UpsellWrapper";
import S from "./Upsells.module.css";
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
      className={S.UpsellBannerComponent}
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

      <ExternalLink
        className={S.UpsellCTALink}
        href={url}
        onClickCapture={() => trackUpsellClicked({ source, campaign })}
      >
        {buttonText}
      </ExternalLink>
    </Box>
  );
};

export const UpsellBanner = UpsellWrapper(_UpsellBanner);
