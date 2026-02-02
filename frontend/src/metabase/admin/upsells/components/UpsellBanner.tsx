import cx from "classnames";
import { useMount } from "react-use";
import { t } from "ttag";

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

import S from "./UpsellBanner.module.css";
import {
  type DismissibleProps,
  UpsellWrapperDismissible,
} from "./UpsellBannerDismissible";
import { UpsellCta } from "./UpsellCta";
import { UpsellGem } from "./UpsellGem";
import { UpsellWrapper } from "./UpsellWrapper";
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
  location: string;
  large?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
};

export type UpsellBannerProps =
  | (UpsellBannerPropsBase & CardLinkProps)
  | (UpsellBannerPropsBase & CardLinkProps & DismissibleProps);

export const UpsellBannerInner: React.FC<UpsellBannerProps> = ({
  title,
  buttonText,
  buttonLink,
  internalLink,
  campaign,
  location,
  large,
  children,
  onClick,
  ...props
}: UpsellBannerProps) => {
  const urlWithParams = useUpsellLink({
    url: buttonLink ?? UPGRADE_URL,
    campaign,
    location,
  });

  useMount(() => {
    trackUpsellViewed({ location, campaign });
  });

  const { dismissible, onDismiss, ...domProps } =
    "dismissible" in props
      ? props
      : { dismissible: false, onDismiss: () => {} };
  const gemSize = large ? 24 : undefined;

  return (
    <Box
      className={cx(S.UpsellBannerComponent, large && S.Large)}
      data-testid="upsell-banner"
      bg="background-primary"
      {...domProps}
    >
      <Flex align="flex-start" gap="sm" wrap="nowrap">
        <UpsellGem size={gemSize} mt="1px" />

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
        <UpsellCta
          onClick={onClick}
          url={buttonLink ? urlWithParams : undefined}
          internalLink={internalLink}
          buttonText={buttonText}
          onClickCapture={() => trackUpsellClicked({ location, campaign })}
          size={large ? "large" : undefined}
        />

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
  UpsellWrapper(UpsellBannerInner),
);
