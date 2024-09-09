import cx from "classnames";
import type { ChangeEventHandler } from "react";
import { Link } from "react-router";
import { jt, t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { getPlan } from "metabase/common/utils/plan";
import ExternalLink from "metabase/core/components/ExternalLink";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING } from "metabase/plugins";
import {
  getDocsUrl,
  getSetting,
  getUpgradeUrl,
} from "metabase/selectors/settings";
import {
  Button,
  type ButtonProps,
  Flex,
  Icon,
  Switch,
  Text,
  Title,
} from "metabase/ui";

import EmbeddingOptionStyle from "./EmbeddingOption.module.css";
import { BoldExternalLink, Label, StyledCard } from "./EmbeddingOption.styled";
import InteractiveEmbedding from "./InteractiveEmbedding.svg?component";
import SdkIcon from "./SdkIcon.svg?component";
import StaticEmbedding from "./StaticEmbedding.svg?component";

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
  const titleId = useUniqueId();
  return (
    <StyledCard compact role="article" aria-labelledby={titleId}>
      {icon}
      <Flex gap="md" mt="md" mb="sm" direction={"row"}>
        <Title id={titleId} order={2}>
          {title}
        </Title>
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

interface EmbeddingOptionCardProps {
  onToggle: ChangeEventHandler<HTMLInputElement>;
}
export const StaticEmbeddingOptionCard = ({
  onToggle,
}: EmbeddingOptionCardProps) => {
  const isStaticEmbeddingEnabled = useSetting("enable-embedding-static");
  const upgradeUrl = useSelector(state =>
    getUpgradeUrl(state, { utm_content: "embed-settings" }),
  );
  const shouldPromptToUpgrade = !PLUGIN_EMBEDDING.isEnabled();

  const upgradeText = jt`A "powered by Metabase" banner appears on static embeds. You can ${(
    <ExternalLink key="upgrade-link" href={upgradeUrl}>
      {t`upgrade to a paid plan`}
    </ExternalLink>
  )} to remove it.`;

  return (
    <EmbeddingOption
      icon={
        <StaticEmbedding
          className={cx(EmbeddingOptionStyle.icon, {
            [EmbeddingOptionStyle.disabled]: !isStaticEmbeddingEnabled,
          })}
        />
      }
      title={t`Static embedding`}
      description={jt`Use static embedding when you don’t want to give people ad hoc query access to their data for whatever reason, or you want to present data that applies to all of your tenants at once.${
        shouldPromptToUpgrade && (
          <Text size="sm" mt="xs" key="upgrade-text">
            {upgradeText}
          </Text>
        )
      }`}
    >
      <Flex align="center" w="100%">
        <LinkButton
          variant="default"
          disabled={!isStaticEmbeddingEnabled}
          to={"/admin/settings/embedding-in-other-applications/standalone"}
        >
          {t`Manage`}
        </LinkButton>
        <Switch
          size="sm"
          label={isStaticEmbeddingEnabled ? t`Enabled` : t`Disabled`}
          ml="auto"
          labelPosition="left"
          checked={isStaticEmbeddingEnabled}
          onChange={onToggle}
        />
      </Flex>
    </EmbeddingOption>
  );
};

export function EmbeddingSdkOptionCard({ onToggle }: EmbeddingOptionCardProps) {
  const isEmbeddingSdkEnabled = useSetting("enable-embedding-sdk");
  const isEE = PLUGIN_EMBEDDING.isEnabled();

  return (
    <EmbeddingOption
      icon={
        <SdkIcon
          className={cx(EmbeddingOptionStyle.icon, {
            [EmbeddingOptionStyle.disabled]: !isEmbeddingSdkEnabled,
          })}
        />
      }
      title={t`Embedding SDK for React`}
      label={t`PRO & ENTERPRISE`}
      description={t`Interactive embedding with full, granular control. Embed and style individual Metabase components in your app, and tailor the experience to each person. Allows for CSS styling, custom user flows, event subscriptions, and more. Only available with SSO via JWT.`}
    >
      <Flex align="center" w="100%">
        <LinkButton to={"/admin/settings/embedding-in-other-applications/sdk"}>
          {!isEE ? t`Try it out` : t`Configure`}
        </LinkButton>
        <Switch
          size="sm"
          label={isEmbeddingSdkEnabled ? t`Enabled` : t`Disabled`}
          ml="auto"
          labelPosition="left"
          checked={isEmbeddingSdkEnabled}
          onChange={onToggle}
        />
      </Flex>
    </EmbeddingOption>
  );
}

export const InteractiveEmbeddingOptionCard = ({
  onToggle,
}: EmbeddingOptionCardProps) => {
  const isEE = PLUGIN_EMBEDDING.isEnabled();
  const plan = useSelector(state =>
    getPlan(getSetting(state, "token-features")),
  );
  const isInteractiveEmbeddingEnabled = useSetting(
    "enable-embedding-interactive",
  );
  const quickStartUrl = useSelector(state =>
    getDocsUrl(state, {
      page: "embedding/interactive-embedding-quick-start-guide",
    }),
  );

  return (
    <EmbeddingOption
      icon={
        <InteractiveEmbedding
          className={cx(EmbeddingOptionStyle.icon, {
            [EmbeddingOptionStyle.disabled]:
              isEE && !isInteractiveEmbeddingEnabled,
          })}
        />
      }
      title={t`Interactive embedding`}
      label={t`PRO & ENTERPRISE`}
      description={jt`Use interactive embedding when you want to ${(
        <ExternalLink
          href={`https://www.metabase.com/blog/why-full-app-embedding?utm_source=${plan}&utm_media=embed-settings`}
          key="why-full-app-embedding"
        >
          {t`offer multi-tenant, self-service analytics`}
        </ExternalLink>
      )} and people want to create their own questions, dashboards, models, and more, all in their own data sandbox.`}
    >
      <BoldExternalLink
        href={`${quickStartUrl}?utm_source=${plan}&utm_media=embed-settings`}
      >
        {t`Check out our Quick Start`}
        <Icon name="share" aria-hidden />
      </BoldExternalLink>
      <Flex align="center" w="100%">
        {isEE ? (
          <LinkButton
            to={"/admin/settings/embedding-in-other-applications/full-app"}
            disabled={!isInteractiveEmbeddingEnabled}
          >
            {t`Configure`}
          </LinkButton>
        ) : (
          <Button
            component={ExternalLink}
            href={`https://www.metabase.com/product/embedded-analytics?utm_source=${plan}&utm_media=embed-settings`}
          >
            {t`Learn More`}
          </Button>
        )}
        <Switch
          size="sm"
          label={isInteractiveEmbeddingEnabled ? t`Enabled` : t`Disabled`}
          ml="auto"
          labelPosition="left"
          checked={isInteractiveEmbeddingEnabled}
          onChange={onToggle}
        />
      </Flex>
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
