import cx from "classnames";
import { useMount } from "react-use";

import ExternalLink from "metabase/core/components/ExternalLink";
import { Box, Flex, Image, Stack, Text, Title } from "metabase/ui";

import { UpsellGem } from "./UpsellGem";
import { UpsellWrapper } from "./UpsellWrapper";
import S from "./Upsells.module.css";
import { trackUpsellClicked, trackUpsellViewed } from "./analytics";
import { useUpsellLink } from "./use-upsell-link";

export type UpsellCardProps = {
  title: string;
  buttonText: string;
  buttonLink: string;
  campaign: string;
  source: string;
  illustrationSrc?: string;
  children: React.ReactNode;
  large?: boolean;
  style?: React.CSSProperties;
} & (
  | {
      maxWidth?: never;
      fullWidth?: boolean;
    }
  | {
      maxWidth?: number;
      fullWidth?: never;
    }
);

export const _UpsellCard: React.FC<UpsellCardProps> = ({
  title,
  buttonText,
  buttonLink,
  campaign,
  source,
  illustrationSrc,
  children,
  fullWidth,
  maxWidth,
  large = false,
  ...props
}: UpsellCardProps) => {
  const url = useUpsellLink({
    url: buttonLink,
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
          <Title lh={1.25} order={2} className={S.Title}>
            {title}
          </Title>
        </Flex>
        <Stack gap="md">
          <Text lh="1rem" px="1rem">
            {children}
          </Text>
          <Box
            component={ExternalLink}
            onClickCapture={() => trackUpsellClicked({ source, campaign })}
            href={url}
            className={S.UpsellCTALink}
            mx="md"
            mb="lg"
          >
            {buttonText}
          </Box>
        </Stack>
      </Stack>
    </Box>
  );
};

export const UpsellCard = UpsellWrapper(_UpsellCard);
