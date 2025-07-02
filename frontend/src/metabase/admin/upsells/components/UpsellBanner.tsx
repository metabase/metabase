import { useMount } from "react-use";
import { t } from "ttag";

import ExternalLink from "metabase/common/components/ExternalLink";
import Link from "metabase/common/components/Link";
import {
  Box,
  Flex,
  Icon,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "metabase/ui";

import { UPGRADE_URL } from "../constants";

import {
  type DismissibleProps,
  UpsellWrapperDismissible,
} from "./UpsellBannerDismissible";
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

type UpsellBannerPropsBase = {
  title: string;
  buttonText: string;
  campaign: string;
  source: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
};

export type UpsellBannerProps =
  | (UpsellBannerPropsBase & CardLinkProps)
  | (UpsellBannerPropsBase & CardLinkProps & DismissibleProps);

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

  const { dismissible, onDismiss, ...domProps } =
    "dismissible" in props
      ? props
      : { dismissible: false, onDismiss: () => {} };

  return (
    <Box
      className={S.UpsellBannerComponent}
      data-testid="upsell-banner"
      bg="bg-white"
      {...domProps}
    >
      <Flex align="center" gap="md" wrap="nowrap">
        <UpsellGem />
        <Stack gap="xs">
          <Title lh={1.25} order={3} size="md">
            {title}
          </Title>
          <Text lh="1rem" size="sm" c="text-secondary">
            {children}
          </Text>
        </Stack>
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

        {dismissible && (
          <UnstyledButton
            role="button"
            component={Icon}
            size="1rem"
            name="close"
            aria-label={t`Dismiss banner`}
            onClick={onDismiss}
          />
        )}
      </Flex>
    </Box>
  );
};

export const UpsellBanner = UpsellWrapperDismissible(
  UpsellWrapper(_UpsellBanner),
);
