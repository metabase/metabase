import type { ComponentType, ReactNode } from "react";
import { useState } from "react";
import { jt, t } from "ttag";

import SlackAppsLink from "../SlackAppsLink";
import SlackBadge from "../SlackBadge";

import {
  HeaderMessage,
  HeaderRoot,
  HeaderTitle,
  SectionBody,
  SectionHeader,
  SectionMessage,
  SectionRoot,
  SectionTitle,
  SectionToggle,
  SetupRoot,
} from "./SlackSetup.styled";

export interface SlackSetupProps {
  Form: ComponentType;
  manifest?: string;
  isBot?: boolean;
  isValid?: boolean;
}

const SlackSetup = ({
  Form,
  manifest,
  isBot,
  isValid,
}: SlackSetupProps): JSX.Element => {
  return (
    <SetupRoot>
      <SetupHeader isBot={isBot} isValid={isValid} />
      <CreateAppSection manifest={manifest} />
      <ActivateAppSection Form={Form} />
    </SetupRoot>
  );
};

interface SetupHeaderProps {
  isBot?: boolean;
  isValid?: boolean;
}

const SetupHeader = ({ isBot, isValid }: SetupHeaderProps): JSX.Element => {
  return (
    <HeaderRoot>
      <HeaderTitle>{t`Metabase on Slack`}</HeaderTitle>
      {isBot ? (
        <HeaderMessage>
          <SlackBadge isBot={isBot} isValid={isValid} />{" "}
          {jt`We recommend you ${(
            <strong key="apps">{t`upgrade to Slack Apps`}</strong>
          )}, see the instructions below:`}
        </HeaderMessage>
      ) : (
        <HeaderMessage>
          {t`Bring the power of Metabase to your Slack #channels.`}{" "}
          {t`Follow these steps to connect to Slack:`}
        </HeaderMessage>
      )}
    </HeaderRoot>
  );
};

interface SetupSectionProps {
  title: string;
  children?: ReactNode;
}

const SetupSection = ({ title, children }: SetupSectionProps): JSX.Element => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <SectionRoot>
      <SectionHeader onClick={() => setIsExpanded(!isExpanded)}>
        <SectionTitle>{title}</SectionTitle>
        <SectionToggle
          round
          icon={isExpanded ? "chevronup" : "chevrondown"}
          aria-label={t`Setup section`}
          aria-expanded={isExpanded}
        />
      </SectionHeader>
      {isExpanded && <SectionBody>{children}</SectionBody>}
    </SectionRoot>
  );
};

interface CreateAppSectionProps {
  manifest?: string;
}

const CreateAppSection = ({ manifest }: CreateAppSectionProps): JSX.Element => {
  return (
    <SetupSection
      title={t`1. Click the button below and create your Slack App`}
    >
      <SectionMessage>
        {jt`First, ${(
          <strong key="click-button">{t`click the button below to create your Slack App`}</strong>
        )} using the Metabase configuration. Once created, click “${(
          <strong key="install-app">{t`Install to workspace`}</strong>
        )}” to authorize it.`}
      </SectionMessage>
      <SlackAppsLink manifest={manifest} />
    </SetupSection>
  );
};

interface ActivateAppSectionProps {
  Form: ComponentType;
}

const ActivateAppSection = ({ Form }: ActivateAppSectionProps): JSX.Element => {
  return (
    <SetupSection
      title={t`2. Activate the OAuth Token and create a new slack channel`}
    >
      <SectionMessage>
        {jt`Click on "${(
          <strong key="click">{t`OAuth and Permissions`}</strong>
        )}" in the sidebar, copy the “${(
          <strong key="token">{t`Bot User OAuth Token`}</strong>
        )}” and paste it here.`}
      </SectionMessage>
      <Form />
    </SetupSection>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SlackSetup;
