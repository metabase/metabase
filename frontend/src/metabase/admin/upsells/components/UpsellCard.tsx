import { useMount } from "react-use";

import { Flex, Image, Text } from "metabase/ui";

import { UpsellGem } from "./UpsellGem";
import { UpsellWrapper } from "./UpsellWrapper";
import { UpsellCTALink, UpsellCardComponent } from "./Upsells.styled";
import { trackUpsellClicked, trackUpsellViewed } from "./analytics";
import { useUpsellLink } from "./use-upsell-link";

type OwnProps = {
  title: string;
  buttonText: string;
  buttonLink: string;
  campaign: string;
  source: string;
  illustrationSrc?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
};

interface FullWidthVariant {
  maxWidth?: never;
  fullWidth?: boolean;
}

interface FixedWidthVariant {
  maxWidth?: number;
  fullWidth?: never;
}

type Variants = FullWidthVariant | FixedWidthVariant;

type UpsellCardProps = OwnProps & Variants;

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

  return (
    <UpsellCardComponent
      data-testid="upsell-card"
      fullWidth={fullWidth}
      maxWidth={maxWidth}
      {...props}
    >
      {illustrationSrc && <Image src={illustrationSrc} w="100%" />}
      <Flex gap="sm" p="1rem" pb="0.75rem">
        <UpsellGem />
        <Text fw="bold" size="0.875rem">
          {title}
        </Text>
      </Flex>
      <Text size="0.75rem" lh="1rem" px="1rem" pb="1rem">
        {children}
      </Text>
      <UpsellCTALink
        onClickCapture={() => trackUpsellClicked({ source, campaign })}
        href={url}
      >
        {buttonText}
      </UpsellCTALink>
    </UpsellCardComponent>
  );
};

export const UpsellCard = UpsellWrapper(_UpsellCard);
