import cx from "classnames";
import { useMount } from "react-use";

import { Box, Flex, Image, Stack, Text, Title } from "metabase/ui";

import { UpsellCta } from "../../../admin/upsells/components/UpsellCta";
import { UpsellGem } from "../../../admin/upsells/components/UpsellGem";
import { UpsellWrapper } from "../../../admin/upsells/components/UpsellWrapper";
import {
  trackUpsellClicked,
  trackUpsellViewed,
} from "../../../admin/upsells/components/analytics";
import { useUpsellLink } from "../../../admin/upsells/components/use-upsell-link";
import { UPGRADE_URL } from "../../../admin/upsells/constants";

import S from "./UpsellCard.module.css";

type CardWidthProps =
  | {
      maxWidth?: never;
      fullWidth?: boolean;
    }
  | {
      maxWidth?: number;
      fullWidth?: never;
    }
  | {
      maxWidth?: "initial";
      fullWidth?: boolean;
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

export const UpsellCardInner: React.FC<UpsellCardProps> = ({
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

  const normalizedMaxWidth =
    maxWidth === "initial" ? undefined : `${maxWidth ?? 200}px`;

  return (
    <Box
      data-testid="upsell-card"
      w={fullWidth ? "100%" : "auto"}
      maw={normalizedMaxWidth}
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

export const UpsellCard = UpsellWrapper(UpsellCardInner);
