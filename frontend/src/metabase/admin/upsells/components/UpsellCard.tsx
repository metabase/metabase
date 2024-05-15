import { Flex, Image, Text } from "metabase/ui";

import { UpsellGem } from "./UpsellGem";
import { UpsellWrapper } from "./UpsellWrapper";
import { UpsellCTALink, UpsellCardComponent } from "./Upsells.styled";
import { useUpsellLink } from "./use-upsell-link";

type UpsellCardProps = {
  children: React.ReactNode;
  title: string;
  campaign: string;
  source: string;
  buttonText: string;
  buttonLink: string;
  illustrationSrc?: string;
};

export const _UpsellCard = ({
  title,
  buttonText,
  campaign,
  source,
  buttonLink,
  illustrationSrc,
  children,
}: UpsellCardProps) => {
  const url = useUpsellLink({
    url: buttonLink,
    campaign,
    source,
  });

  return (
    <UpsellCardComponent>
      {illustrationSrc && <Image src={illustrationSrc} w="100%" />}
      <Flex gap="sm" justify="center" p="1rem" pb="0.75rem">
        <UpsellGem />
        <Text fw="bold" size="0.875rem">
          {title}
        </Text>
      </Flex>
      <Text size="0.75rem" lh="1rem" px="1rem" pb="1rem">
        {children}
      </Text>
      <UpsellCTALink href={url}>{buttonText}</UpsellCTALink>
    </UpsellCardComponent>
  );
};

export const UpsellCard = UpsellWrapper(_UpsellCard);
