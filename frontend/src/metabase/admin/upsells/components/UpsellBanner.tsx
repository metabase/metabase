import { useMount } from "react-use";

import ExternalLink from "metabase/common/components/ExternalLink";
import Link from "metabase/common/components/Link";
import { Box, Flex, Icon, Text, Title } from "metabase/ui";

import { UpsellWrapperDismissable } from "../UpsellWrapperDismissable";
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
  dismissable?: boolean;
  onDismiss?: () => void;
} & CardLinkProps;

export const _UpsellBanner: React.FC<UpsellBannerProps> = ({
  title,
  buttonText,
  buttonLink,
  internalLink,
  campaign,
  source,
  children,
  dismissable = false,
  onDismiss,
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

      <Flex align="center" gap="md">
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

        {dismissable && onDismiss && (
          <Icon
            name="close"
            onClick={onDismiss}
            style={{ cursor: "pointer" }}
            size={16}
            color="text-medium"
          />
        )}
      </Flex>
    </Box>
  );
};

export const UpsellBanner = UpsellWrapper(
  UpsellWrapperDismissable(_UpsellBanner),
);
