import cx from "classnames";
import { useMount } from "react-use";
import { P, match } from "ts-pattern";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Box, Flex, Image, Stack, Text, Title } from "metabase/ui";

import { UPGRADE_URL } from "../constants";

import S from "./UpsellBigCard.module.css";
import StylesUpsellCtaLink from "./UpsellCta.module.css";
import { UpsellGem } from "./UpsellGem";
import { UpsellWrapper } from "./UpsellWrapper";
import { trackUpsellClicked, trackUpsellViewed } from "./analytics";
import { useUpsellLink } from "./use-upsell-link";

export type UpsellBigCardProps = React.PropsWithChildren<{
  title: string;
  buttonText: string;
  campaign: string;
  source: string;
  illustrationSrc?: string;
  style?: React.CSSProperties;
}> &
  (
    | {
        buttonLink: string;
        onClick?: never;
      }
    | {
        buttonLink?: string;
        onClick: () => void;
      }
  );

export const UpsellBigCardInner: React.FC<UpsellBigCardProps> = ({
  title,
  buttonText,
  buttonLink,
  campaign,
  illustrationSrc,
  onClick,
  source: location,
  children,
  ...props
}: UpsellBigCardProps) => {
  const url = useUpsellLink({
    // The fallback url only applies when the button opens a modal instead of
    // navigating to an external url. The value is not used otherwise. It is
    // there only because we cannot conditionally skip the hook.
    url: buttonLink ?? UPGRADE_URL,
    campaign,
    location,
  });

  useMount(() => {
    trackUpsellViewed({ location, campaign });
  });

  const ctaClassnames = cx(
    StylesUpsellCtaLink.UpsellCTALink,
    StylesUpsellCtaLink.Large,
  );

  return (
    <Box
      data-testid="upsell-big-card"
      className={S.UpsellBigCardComponent}
      bg="background-primary"
      {...props}
    >
      <Flex px="xl" py="md">
        <UpsellGem size={24} />
        <Stack align="flex-start" gap={0} ml="0.75rem" maw="18.75rem">
          <Title order={2} lh={1} mb="sm">
            {title}
          </Title>
          <Text lh="xl" mb="lg">
            {children}
          </Text>
          {match(onClick)
            .with(P.nonNullable, () => (
              <Box
                component="button"
                className={ctaClassnames}
                onClickCapture={() =>
                  trackUpsellClicked({ location, campaign })
                }
                onClick={onClick}
              >
                {buttonText}
              </Box>
            ))
            .otherwise(() => (
              <ExternalLink
                className={ctaClassnames}
                href={url}
                onClickCapture={() =>
                  trackUpsellClicked({ location, campaign })
                }
              >
                {buttonText}
              </ExternalLink>
            ))}
        </Stack>
      </Flex>
      {illustrationSrc && (
        <Image src={illustrationSrc} p="md" pl={0} w="auto" />
      )}
    </Box>
  );
};

export const UpsellBigCard = UpsellWrapper(UpsellBigCardInner);
