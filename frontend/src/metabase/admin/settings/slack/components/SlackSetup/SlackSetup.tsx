import React, { ComponentType, ReactNode, useState } from "react";
import { jt, t } from "ttag";
import Tooltip from "metabase/components/Tooltip";
import SlackBadge from "../SlackBadge";
import SlackAppsButton from "../SlackAppsButton";
import { useCopyTooltip } from "../../hooks/use-copy-tooltip";
import {
  HeaderMessage,
  HeaderRoot,
  HeaderTitle,
  SectionBody,
  SectionCode,
  SectionCodeButton,
  SectionCodeContent,
  SectionHeader,
  SectionLink,
  SectionMessage,
  SectionRoot,
  SectionTitle,
  SectionToggle,
  SetupHelpCard,
  SetupRoot,
} from "./SlackSetup.styled";

export interface SlackSetupProps {
  Form: ComponentType;
  manifest?: string;
  isBot?: boolean;
  hasError?: boolean;
}

const SlackSetup = ({
  Form,
  manifest,
  isBot,
  hasError,
}: SlackSetupProps): JSX.Element => {
  return (
    <SetupRoot>
      <SetupHeader isBot={isBot} hasError={hasError} />
      <CreateAppSection />
      <CopyManifestSection manifest={manifest} />
      <ActivateAppSection Form={Form} />
      <SetupHelpCard />
    </SetupRoot>
  );
};

interface SetupHeaderProps {
  isBot?: boolean;
  hasError?: boolean;
}

const SetupHeader = ({ isBot, hasError }: SetupHeaderProps): JSX.Element => {
  return (
    <HeaderRoot>
      <HeaderTitle>{t`Metabase on Slack`}</HeaderTitle>
      {isBot ? (
        <HeaderMessage>
          <SlackBadge isBot={isBot} hasError={hasError} />{" "}
          {jt`We recommend you ${(
            <strong key="apps">{t`upgrade to Slack Apps`}</strong>
          )}, see the instructions below:`}
        </HeaderMessage>
      ) : (
        <HeaderMessage>
          {t`Bring the power of Metabase to your Slack #channels.`}{" "}
          {t`Follow these steps to connect your bot to Slack:`}
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

const CreateAppSection = (): JSX.Element => {
  return (
    <SetupSection title={t`1. Create your Slack App`}>
      <SectionMessage>
        {t`To create your Metabase integration on Slack you’ll need to set up some things.`}{" "}
        {jt`First, go to ${(
          <SectionLink
            key="message"
            href="https://api.slack.com/apps"
          >{t`Slack Apps`}</SectionLink>
        )}, hit “${(
          <strong key="app">{t`Create New App`}</strong>
        )}” and pick “${(
          <strong key="manifest">{t`From an app manifest`}</strong>
        )}”.`}
      </SectionMessage>
      <SlackAppsButton />
    </SetupSection>
  );
};

export interface CopyManifestSectionProps {
  manifest?: string;
}

const CopyManifestSection = ({
  manifest,
}: CopyManifestSectionProps): JSX.Element => {
  const { element, handleClick } = useCopyTooltip(manifest);

  return (
    <SetupSection title={t`2. Copy the Metabase manifest`}>
      <SectionMessage>
        {jt`Copy our ${(
          <strong key="manifest">{t`Slack Manifest`}</strong>
        )} below and paste it in to create the app. In the following screen, click “${(
          <strong key="install">{t`Install to workspace`}</strong>
        )}” and authorize it.`}
      </SectionMessage>
      <SectionCode>
        <SectionCodeContent>{manifest}</SectionCodeContent>
        <SectionCodeButton small onClick={handleClick}>
          {t`Copy`}
        </SectionCodeButton>
        {element && (
          <Tooltip tooltip={t`Copied!`} reference={element} isOpen={true} />
        )}
      </SectionCode>
    </SetupSection>
  );
};

interface ActivateAppSectionProps {
  Form: ComponentType;
}

const ActivateAppSection = ({ Form }: ActivateAppSectionProps): JSX.Element => {
  return (
    <SetupSection
      title={t`3. Activate the OAuth Token and create a new slack channel`}
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

export default SlackSetup;
