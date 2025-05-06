import cx from "classnames";
import { useMount } from "react-use";

import ExternalLink from "metabase/core/components/ExternalLink";
import Link from "metabase/core/components/Link";
import { Box, Flex, Image, Stack, Text, Title } from "metabase/ui";

import { UPGRADE_URL } from "../constants";

import { UpsellGem } from "./UpsellGem";
import { UpsellWrapper } from "./UpsellWrapper";
import S from "./Upsells.module.css";
import { trackUpsellClicked, trackUpsellViewed } from "./analytics";
import { useUpsellLink } from "./use-upsell-link";

type CardWidthProps =
  | {
      maxWidth?: never;
      fullWidth?: boolean;
    }
  | {
      maxWidth?: number;
      fullWidth?: never;
    };

type CardLinkProps =
  | {
      buttonLink: string;
      internalLink?: never;
    }
  | {
      internalLink: string;
      buttonLink?: never;
    };

export type UpsellCardProps = {
  title: string;
  buttonText: string;
  campaign: string;
  source: string;
  illustrationSrc?: string;
  children: React.ReactNode;
  large?: boolean;
  style?: React.CSSProperties;
} & CardWidthProps &
  CardLinkProps;

export const _UpsellCard: React.FC<UpsellCardProps> = ({
  title,
  buttonText,
  buttonLink,
  campaign,
  source,
  illustrationSrc,
  internalLink,
  children,
  fullWidth,
  maxWidth,
  large = false,
  ...props
}: UpsellCardProps) => {
  const url = useUpsellLink({
    url: buttonLink ?? UPGRADE_URL,
    campaign,
    source,
  });

  useMount(() => {
    trackUpsellViewed({ source, campaign });
  });

  const gemSize = large ? "24px" : undefined;

  const className = cx(S.UpsellCardComponent, {
    [S.Default]: !large,
    [S.Large]: large,
  });

  return (
    <Box
      data-testid="upsell-card"
      w={fullWidth ? "100%" : "auto"}
      maw={`${maxWidth ?? 200}px`}
      {...props}
      className={className}
    >
      {illustrationSrc && <Image src={illustrationSrc} w="100%" />}
      <Stack className={S.MainStack} gap={0}>
        <Flex align="center" gap="sm" p="1rem" pb="0.75rem">
          <UpsellGem size={gemSize} />
          <Title lh={1.25} order={3} className={S.Title}>
            {title}
          </Title>
        </Flex>
        <Stack gap="md">
          <Text lh="1rem" px="1rem">
            {children}
          </Text>
          <Box mx="md" mb="lg">
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
        </Stack>
      </Stack>
    </Box>
  );
};

export const UpsellCard = UpsellWrapper(_UpsellCard);
