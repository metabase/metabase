import { t } from "ttag";
import Link from "metabase/core/components/Link";
import {
  ClickIcon,
  CTAContainer,
  CTAHeader,
  ProBadge,
} from "metabase/public/components/widgets/SharingPane/InteractiveEmbeddingCTA/InteractiveEmbeddingCTA.styled";
import { getIsPaidPlan } from "metabase/selectors/settings";
import { Text, Group, Stack } from "metabase/ui";
import { useSelector } from "metabase/lib/redux";

const getText = (isPaidPlan: boolean) => {
  if (isPaidPlan) {
    return {
      showProBadge: false,
      description: t`Your plan allows you to use Interactive Embedding create interactive embedding experiences with drill-through and more.`,
      linkText: t`Set it up`,
      linkTarget: "/admin/settings/embedding-in-other-applications/full-app",
    };
  }

  return {
    showProBadge: true,
    description: t`Give your customers the full power of Metabase in your own app, with SSO, advanced permissions, customization, and more.`,
    linkText: t`Learn more`,
    linkTarget: "https://www.metabase.com/product/embedded-analytics",
  };
};

export const InteractiveEmbeddingCTA = () => {
  const isPaidPlan = useSelector(getIsPaidPlan);

  const { showProBadge, description, linkText, linkTarget } =
    getText(isPaidPlan);

  const badge = (
    // TODO: make sure this is ok for non-english languages
    // TODO: Check padding because design keeps using non-mantine-standard units
    <ProBadge bg="brand.1" py="2px" px="6px">
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
  );

  return (
    <Link to={linkTarget}>
      <CTAContainer withBorder p="md">
        <Group spacing="md" align="flex-start">
          <ClickIcon name="click" size={32} />
          <Stack spacing={0}>
            <Group spacing="sm">
              <CTAHeader
                fz="md"
                order={5}
              >{t`Interactive Embedding`}</CTAHeader>
              {showProBadge && badge}
            </Group>
            <Text lh="unset" fz="sm">
              {description}{" "}
              <Text color="brand.1" fw={700} fz="sm">
                {linkText}
              </Text>
            </Text>
          </Stack>
        </Group>
      </CTAContainer>
    </Link>
  );
};
