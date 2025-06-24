import { useMount } from "react-use";

import ExternalLink from "metabase/core/components/ExternalLink";
import Link from "metabase/core/components/Link";
import { Box, Flex, Text, Title } from "metabase/ui";

import { UPGRADE_URL } from "../constants";

import { UpsellGem } from "./UpsellGem";
import { UpsellWrapper } from "./UpsellWrapper";
import S from "./Upsells.module.css";
import { trackUpsellClicked, trackUpsellViewed } from "./analytics";
import { useUpsellLink } from "./use-upsell-link";

type CardLinkProps =
  | {
      buttonLink: string;
      internalLink?: never;
    }
  | {
      internalLink: string;
      buttonLink?: never;
    };

export type UpsellBannerProps = {
  title: string;
  buttonText: string;
  campaign: string;
  source: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
} & CardLinkProps;

export const _UpsellBanner: React.FC<UpsellBannerProps> = ({
  title,
  buttonText,
  buttonLink,
  internalLink,
  campaign,
  source,
  children,
  ...props
}: UpsellBannerProps) => {
  const url = useUpsellLink({
    url: buttonLink ?? UPGRADE_URL,
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
      bg="bg-white"
      {...props}
    >
      <Flex align="center" gap="md" wrap="nowrap">
        <UpsellGem />
        <Box>
          <Title lh={1.25} order={3} size="md">
            {title}
          </Title>
          <Text lh="1rem" size="sm">
            {children}
          </Text>
        </Box>
      </Flex>

      {buttonLink !== undefined ? (
        <ExternalLink
          onClickCapture={() => trackUpsellClicked({ source, campaign })}
          href={url}
          className={S.UpsellCTALink}
        >
          {buttonText}
        </ExternalLink>
      ) : (
        <Link
          onClickCapture={() => trackUpsellClicked({ source, campaign })}
          to={internalLink}
          className={S.UpsellCTALink}
        >
          {buttonText}
        </Link>
      )}
    </Box>
  );
};

export const UpsellBanner = UpsellWrapper(_UpsellBanner);
