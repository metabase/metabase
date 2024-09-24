import { useMount } from "react-use";

import {
  Box,
  Flex,
  Image,
  Stack,
  type StackProps,
  type StackProps,
  Text,
  Title,
} from "metabase/ui";

import { UpsellGem } from "./UpsellGem";
import { UpsellWrapper } from "./UpsellWrapper";
import { UpsellCTALink, UpsellCardComponent } from "./Upsells.styled";
import { trackUpsellClicked, trackUpsellViewed } from "./analytics";
import { useUpsellLink } from "./use-upsell-link";

type UpsellCardProps = {
  title: string;
  buttonText: string;
  buttonLink: string;
  campaign: string;
  source: string;
  illustrationSrc?: string;
  children: React.ReactNode;
  variant?: "default" | "large";
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
  variant = "default",
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
  const StackVariant = variant === "large" ? LargeStack : Stack;

  return (
    <UpsellCardComponent
      data-testid="upsell-card"
      fullWidth={fullWidth}
      maxWidth={maxWidth}
      {...props}
    >
      {illustrationSrc && <Image src={illustrationSrc} w="100%" />}
      <StackVariant spacing={0}>
        <Flex align="center" gap="sm" p="1rem" pb="0.75rem">
          <UpsellGem size={variant === "large" ? 24 : 16} />
          {variant === "large" ? (
            <Title order={2}>{title}</Title>
          ) : (
            <Text fw="bold" size="0.875rem">
              {title}
            </Text>
          )}
        </Flex>
        <Stack
          spacing="md"
          style={variant === "large" ? { paddingInlineStart: "2rem" } : {}}
        >
          <Text lh="1rem" px="1rem">
            {children}
          </Text>
          <Box
            component={UpsellCTALink}
            onClickCapture={() => trackUpsellClicked({ source, campaign })}
            href={url}
            w={variant === "large" ? "10rem" : undefined}
          >
            {buttonText}
          </Box>
        </Stack>
      </StackVariant>
    </UpsellCardComponent>
  );
};

export const UpsellCard = UpsellWrapper(_UpsellCard);

const LargeStack = (props: StackProps) => (
  <Stack
    pt="3rem"
    pb="1.5rem"
    style={{ paddingInlineStart: "1.5rem" }}
    {...props}
  />
);
