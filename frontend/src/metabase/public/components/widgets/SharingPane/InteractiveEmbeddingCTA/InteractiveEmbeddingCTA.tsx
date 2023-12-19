import { t } from "ttag";
import Link from "metabase/core/components/Link";
import { getIsPaidPlan } from "metabase/selectors/settings";
import { Text, Group, Stack, Box } from "metabase/ui";
import { useSelector } from "metabase/lib/redux";
import {
  ClickIcon,
  CTAContainer,
  CTAHeader,
  ProBadge,
} from "./InteractiveEmbeddingCTA.styled";

const useCTAText = () => {
  const isPaidPlan = useSelector(getIsPaidPlan);

  if (isPaidPlan) {
    return {
      showProBadge: false,
      description: t`Your plan allows you to use Interactive Embedding create interactive embedding experiences with drill-through and more.`,
      linkText: t`Set it up`,
      url: "/admin/settings/embedding-in-other-applications/full-app",
    };
  }

  return {
    showProBadge: true,
    description: t`Give your customers the full power of Metabase in your own app, with SSO, advanced permissions, customization, and more.`,
    linkText: t`Learn more`,
    url: "https://www.metabase.com/product/embedded-analytics",
    target: "_blank",
  };
};

export const InteractiveEmbeddingCTA = () => {
  const { showProBadge, description, linkText, url, target } = useCTAText();

  const badge = (
    // TODO: Check padding because design keeps using non-mantine-standard units
    <Box pos="relative">
      <ProBadge bg="brand.1" py="2px" px="6px" pos="absolute" top="-0.6rem">
        <Text
          align="center"
          c="white"
          span
          tt="uppercase"
          lts="0.7"
          size="sm"
          fw={700}
        >{t`Pro`}</Text>
      </ProBadge>
    </Box>
  );

  return (
    <Link to={url} target={target}>
      <CTAContainer withBorder p="md">
        <Group spacing="md" align="flex-start">
          <ClickIcon name="click" size={32} />
          <Stack spacing="sm">
            <Group spacing="sm">
              <CTAHeader
                inline
                fz="md"
                order={5}
              >{t`Interactive Embedding`}</CTAHeader>
              {showProBadge && badge}
            </Group>
            <Text inline lh="unset" fz="sm">
              {description}
              {"  "}
              <Text inline inherit span color="brand.1" fw={700}>
                {linkText}
              </Text>
            </Text>
          </Stack>
        </Group>
      </CTAContainer>
    </Link>
  );
};
