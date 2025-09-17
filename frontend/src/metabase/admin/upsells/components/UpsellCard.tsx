import cx from "classnames";
import { useMount } from "react-use";

import { Box, Flex, Image, Stack, Text, Title } from "metabase/ui";

import { UPGRADE_URL } from "../constants";

import S from "./UpsellCard.module.css";
import { UpsellCta } from "./UpsellCta";
import { UpsellGem } from "./UpsellGem";
import { UpsellWrapper } from "./UpsellWrapper";
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
  location: string;
  illustrationSrc?: string;
  children: React.ReactNode;
  large?: boolean;
  style?: React.CSSProperties;
  onClick?: () => void;
  buttonStyle?: React.CSSProperties;
} & CardWidthProps &
  CardLinkProps;

export const _UpsellCard: React.FC<UpsellCardProps> = ({
  title,
  buttonText,
  buttonLink,
  campaign,
  location,
  illustrationSrc,
  internalLink,
  children,
  fullWidth,
  maxWidth,
  large = false,
  onClick,
  buttonStyle,
  ...props
}: UpsellCardProps) => {
  const urlWithParams = useUpsellLink({
    url: buttonLink ?? UPGRADE_URL,
    campaign,
    location,
  });

  useMount(() => {
    trackUpsellViewed({ location, campaign });
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
            <UpsellCta
              style={buttonStyle}
              onClick={onClick}
              url={buttonLink ? urlWithParams : undefined}
              internalLink={internalLink}
              buttonText={buttonText}
              onClickCapture={() => trackUpsellClicked({ location, campaign })}
            />
          </Box>
        </Stack>
      </Stack>
    </Box>
  );
};

export const UpsellCard = UpsellWrapper(_UpsellCard);
