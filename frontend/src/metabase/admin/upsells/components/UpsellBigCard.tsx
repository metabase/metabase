import cx from "classnames";
import { useMount } from "react-use";

import ExternalLink from "metabase/common/components/ExternalLink";
import { Box, Flex, Image, Stack, Text, Title } from "metabase/ui";

import { UPGRADE_URL } from "../constants";

import { useUpgradeAction } from "./UpgradeModal";
import S from "./UpsellBigCard.module.css";
import StylesUpsellCtaLink from "./UpsellCta.module.css";
import { UpsellGem } from "./UpsellGem";
import { UpsellWrapper } from "./UpsellWrapper";
import { trackUpsellClicked, trackUpsellViewed } from "./analytics";

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

export const _UpsellBigCard: React.FC<UpsellBigCardProps> = ({
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
  const { onClick: upgradeOnClick, url: upgradeUrl } = useUpgradeAction({
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

  // Use onClick if provided, otherwise use upgrade action
  const handleClick = onClick ?? upgradeOnClick;

  const renderCta = () => {
    if (handleClick) {
      return (
        <Box
          component="button"
          className={ctaClassnames}
          onClick={handleClick}
          onClickCapture={() => trackUpsellClicked({ location, campaign })}
        >
          {buttonText}
        </Box>
      );
    }

    return (
      <ExternalLink
        className={ctaClassnames}
        href={upgradeUrl}
        onClickCapture={() => trackUpsellClicked({ location, campaign })}
      >
        {buttonText}
      </ExternalLink>
    );
  };

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
          {renderCta()}
        </Stack>
      </Flex>
      {illustrationSrc && (
        <Image src={illustrationSrc} p="md" pl={0} w="auto" />
      )}
    </Box>
  );
};

export const UpsellBigCard = UpsellWrapper(_UpsellBigCard);
