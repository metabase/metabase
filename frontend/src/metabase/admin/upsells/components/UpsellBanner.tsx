import { useMount } from "react-use";
import { t } from "ttag";

import { Box, Flex, Text, Title } from "metabase/ui";

import S from "./UpsellCard.module.css";
import { UpsellGem } from "./UpsellGem";
import { UpsellWrapper } from "./UpsellWrapper";
import {
  SecondaryCTALink,
  UpsellBannerComponent,
  UpsellCTALink,
} from "./Upsells.styled";
import { trackUpsellClicked, trackUpsellViewed } from "./analytics";
import { useUpsellLink } from "./use-upsell-link";

export type UpsellBannerProps = {
  title: string;
  buttonText: string;
  buttonLink: string;
  campaign: string;
  secondaryLink?: string;
  source: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
};

export const _UpsellBanner: React.FC<UpsellBannerProps> = ({
  title,
  buttonText,
  buttonLink,
  campaign,
  secondaryLink,
  source,
  children,
  ...props
}: UpsellBannerProps) => {
  const url = useUpsellLink({
    url: buttonLink,
    campaign,
    source,
  });

  useMount(() => {
    trackUpsellViewed({ source, campaign });
  });

  return (
    <UpsellBannerComponent data-testid="upsell-banner" {...props}>
      <Flex align="center" gap="md" wrap="nowrap">
        <UpsellGem />
        <Box>
          <Title lh={1.25} order={2} size="md">
            {title}
          </Title>
          <Text lh="1rem" size="sm">
            <>
              {children}
              {secondaryLink && (
                <SecondaryCTALink
                  href={secondaryLink}
                >{t`Learn more`}</SecondaryCTALink>
              )}
            </>
          </Text>
        </Box>
      </Flex>

      <Box
        component={UpsellCTALink}
        onClickCapture={() => trackUpsellClicked({ source, campaign })}
        href={url}
        className={S.UpsellCTALink}
        style={{ flexShrink: 0 }}
      >
        {buttonText}
      </Box>
    </UpsellBannerComponent>
  );
};

export const UpsellBanner = UpsellWrapper(_UpsellBanner);
