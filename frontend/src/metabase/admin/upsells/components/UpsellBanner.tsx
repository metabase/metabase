import cx from "classnames";
import { useMount } from "react-use";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import ExternalLink from "metabase/common/components/ExternalLink";
import Link from "metabase/common/components/Link";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
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
  location: string;
  large?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
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
  location,
  large,
  children,
  onClick,
  ...props
}: UpsellBannerProps) => {
  const url = useUpsellLink({
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
  const contentAlignment = large ? "flex-start" : "center";

  return (
    <Box
      className={cx(S.UpsellBannerComponent, large && S.Large)}
      data-testid="upsell-banner"
      bg="bg-white"
      {...domProps}
    >
      <Flex align={contentAlignment} gap="md" wrap="nowrap">
        <UpsellGem size={gemSize} />
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
        {match({ onClick, buttonLink, internalLink })
          .with(
            { onClick: P.nonNullable, buttonLink: P.any, internalLink: P.any },
            (args) => (
              <UnstyledButton
                onClick={() => {
                  trackUpsellClicked({ location, campaign });
                  args.onClick();
                }}
                className={S.UpsellCTALink}
              >
                {buttonText}
              </UnstyledButton>
            ),
          )
          .with(
            { onClick: P.any, buttonLink: P.nonNullable, internalLink: P.any },
            () => (
              <ExternalLink
                onClickCapture={() =>
                  trackUpsellClicked({ location, campaign })
                }
                href={url}
                className={S.UpsellCTALink}
              >
                {buttonText}
              </ExternalLink>
            ),
          )
          .with(
            {
              onClick: P.any,
              buttonLink: P.any,
              internalLink: P.nonNullable,
            },
            (args) => (
              <Link
                onClickCapture={() =>
                  trackUpsellClicked({ location, campaign })
                }
                to={args.internalLink}
                className={S.UpsellCTALink}
              >
                {buttonText}
              </Link>
            ),
          )
          .otherwise(() => null)}

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

function UpsellBannerWrapper(props: UpsellBannerProps) {
  const { onClick, ...rest } = props;
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFow({
    campaign: props.campaign,
    location: props.location,
  });

  return <_UpsellBanner {...rest} onClick={onClick ?? triggerUpsellFlow} />;
}

export const UpsellBanner = UpsellWrapperDismissible(
  UpsellWrapper(UpsellBannerWrapper),
);
