import { Link } from "react-router";
import { jt, t } from "ttag";
import ExternalLink from "metabase/core/components/ExternalLink";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING } from "metabase/plugins";
import { getSetting } from "metabase/selectors/settings";
import type { ButtonProps } from "metabase/ui";
import { Button, Flex, Text, Title } from "metabase/ui";
import { Label, StyledCard, BoldExternalLink } from "./EmbeddingOption.styled";
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
      <Flex gap="md" mt="md" mb="sm" direction={"row"}>
        <Title order={2}>{title}</Title>
        {label && <Label>{label}</Label>}
      </Flex>
      <Text lh={"1.25rem"} mb={"lg"}>
        {description}
      </Text>
      <Flex gap="lg" direction="column" align="flex-start">
        {children}
      </Flex>
    </StyledCard>
  );
}

export const StaticEmbeddingOptionCard = () => {
  const enabled = useSelector(state => getSetting(state, "enable-embedding"));
  const shouldPromptToUpgrade = !PLUGIN_EMBEDDING.isEnabled();

  const upgradeText = jt`A "powered by Metabase" banner appears on static embeds. You can ${(
    <ExternalLink
      key="upgrade-link"
      href={
        "https://www.metabase.com/pricing/?utm_source=product&utm_medium=CTA&utm_campaign=embed-settings-oss-cta"
      }
    >
      {t`upgrade to a paid plan`}
    </ExternalLink>
  )} to remove it.`;

  return (
    <EmbeddingOption
      icon={enabled ? <StaticEmbeddingOn /> : <StaticEmbeddingOff />}
      title={t`Static embedding`}
      description={jt`Use static embedding when you don’t want to give people ad hoc query access to their data for whatever reason, or you want to present data that applies to all of your tenants at once.${
        shouldPromptToUpgrade && (
          <Text size="sm" mt="xs" key="upgrade-text">
            {upgradeText}
          </Text>
        )
      }`}
    >
      <LinkButton
        variant="default"
        disabled={!enabled}
        to={"/admin/settings/embedding-in-other-applications/standalone"}
      >
        {t`Manage`}
      </LinkButton>
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
      label={t`PRO & ENTERPRISE`}
      description={jt`Use interactive embedding when you want to ${(
        <ExternalLink
          href="https://www.metabase.com/blog/why-full-app-embedding"
          key="why-full-app-embedding"
        >
          {t`offer multi-tenant, self-service analytics`}
        </ExternalLink>
      )} and people want to create their own questions, dashboards, models, and more, all in their own data sandbox.`}
    >
      <BoldExternalLink
        href={
          isEE
            ? "https://www.metabase.com/learn/customer-facing-analytics/interactive-embedding-quick-start?utm_source=product&utm_medium=CTA&utm_campaign=embed-settings-pro-cta"
            : "https://www.metabase.com/learn/customer-facing-analytics/interactive-embedding-quick-start?utm_source=product&utm_medium=CTA&utm_campaign=embed-settings-oss-cta"
        }
      >
        {t`Check out our Quick Start`}
      </BoldExternalLink>
      {isEE ? (
        <LinkButton
          to={"/admin/settings/embedding-in-other-applications/full-app"}
          disabled={!enabled}
        >
          {t`Configure`}
        </LinkButton>
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

// component={Link} breaks the styling when the button is disabled
// disabling a link button doesn't look like a common enough scenario to make an exported component
const LinkButton = ({
  to,
  disabled,
  ...buttonProps
}: { to: string; disabled?: boolean } & ButtonProps) => {
  return disabled ? (
    <Button disabled={disabled} {...buttonProps} />
  ) : (
    <Link to={to}>
      <Button {...buttonProps} />
    </Link>
  );
};
