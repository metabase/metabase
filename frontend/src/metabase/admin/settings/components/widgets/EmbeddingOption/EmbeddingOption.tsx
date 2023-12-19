import { Link } from "react-router";
import { jt, t } from "ttag";
import ExternalLink from "metabase/core/components/ExternalLink";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING } from "metabase/plugins";
import { getSetting } from "metabase/selectors/settings";
import { Button, Flex, Text, Title } from "metabase/ui";
import { Label, StyledCard } from "./EmbeddingOption.styled";
import InteractiveEmbeddingOff from "./InteractiveEmbeddingOff.svg?component";
import InteractiveEmbeddingOn from "./InteractiveEmbeddingOn.svg?component";
import StaticEmbeddingOff from "./StaticEmbeddingOff.svg?component";
import StaticEmbeddingOn from "./StaticEmbeddingOn.svg?component";
interface EmbeddingOptionProps {
  title: string;
  label?: string;
  children?: React.ReactNode;
  description: React.ReactNode;
  icon: React.ReactNode;
}

const interactiveEmbedQuickStartOSSLink =
  "https://www.metabase.com/learn/customer-facing-analytics/interactive-embedding-quick-start?utm_source=product&utm_medium=CTA&utm_campaign=embed-settings-oss-cta";

const interactiveEmbedQuickStartEELink =
  "https://www.metabase.com/learn/customer-facing-analytics/interactive-embedding-quick-start?utm_source=product&utm_medium=CTA&utm_campaign=embed-settings-pro-cta";

function EmbeddingOption({
  title,
  label,
  description,
  children,
  icon,
}: EmbeddingOptionProps) {
  return (
    <StyledCard compact>
      {icon}
      <Flex gap="md" my="md" direction={"row"}>
        <Title order={2}>{title}</Title>
        {label && <Label>{label}</Label>}
      </Flex>
      <Text mb={"lg"}>{description}</Text>
      <Flex gap="md" direction="column" align="flex-start">
        {children}
      </Flex>
    </StyledCard>
  );
}

export const StaticEmbeddingOptionCard = () => {
  const enabled = useSelector(state => getSetting(state, "enable-embedding"));
  return (
    <EmbeddingOption
      icon={enabled ? <StaticEmbeddingOn /> : <StaticEmbeddingOff />}
      title={t`Static embedding`}
      description={t`Use interactive embedding when you want to offer multi-tenant, self-service analytics and people want to create their own questions, dashboards, models, and more, all in their own data sandbox.`}
    >
      <Button
        variant="default"
        disabled={!enabled}
        component={Link}
        to={"/admin/settings/embedding-in-other-applications/standalone"}
      >
        {t`Manage`}
      </Button>
    </EmbeddingOption>
  );
};

export const InteractiveEmbeddingOptionCard = () => {
  const isEE = PLUGIN_EMBEDDING.isEnabled();
  const enabled = useSelector(state => getSetting(state, "enable-embedding"));

  return (
    <EmbeddingOption
      icon={enabled ? <InteractiveEmbeddingOn /> : <InteractiveEmbeddingOff />}
      title={t`Interactive embedding`}
      label={t`PRO/ENTERPRISE`}
      description={jt`Use interactive embedding when you want to ${(
        <ExternalLink
          href="https://www.metabase.com/blog/why-full-app-embedding"
          key="why-full-app-embedding"
        >
          {t`offer multi-tenant, self-service analytics`}
        </ExternalLink>
      )} and people want to create their own questions, dashboards, models, and more, all in their own data sandbox.`}
    >
      <ExternalLink
        href={
          isEE
            ? interactiveEmbedQuickStartEELink
            : interactiveEmbedQuickStartOSSLink
        }
      >
        {t`Check out our Quick Start`}
      </ExternalLink>
      {isEE ? (
        <Button
          component={Link}
          to={"/admin/settings/embedding-in-other-applications/full-app"}
          disabled={!enabled}
        >
          {t`Configure`}
        </Button>
      ) : (
        <Button
          component={ExternalLink}
          href="https://www.metabase.com/product/embedded-analytics?utm_source=product&utm_medium=CTA&utm_campaign=embed-settings-oss-cta"
        >
          {t`Learn More`}
        </Button>
      )}
    </EmbeddingOption>
  );
};
