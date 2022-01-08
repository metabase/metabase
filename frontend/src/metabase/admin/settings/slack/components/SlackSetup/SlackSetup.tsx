import React, { ComponentType, ReactNode, useState } from "react";
import { jt, t } from "ttag";
import { SlackSettings } from "metabase-types/api";
import SlackBadge from "../SlackBadge";
import SlackButton from "../SlackButton";
import {
  BannerIcon,
  BannerRoot,
  BannerText,
  HeaderMessage,
  HeaderRoot,
  HeaderTitle,
  SectionBody,
  SectionCode,
  SectionHeader,
  SectionLink,
  SectionMessage,
  SectionRoot,
  SectionTitle,
  SectionToggle,
  SetupRoot,
} from "./SlackSetup.styled";

export interface SlackSetupProps {
  SetupForm: ComponentType<SlackSetupFormProps>;
  hasSlackBot: boolean;
  hasSlackError: boolean;
  onSubmit: (settings?: SlackSettings) => void;
}

export interface SlackSetupFormProps {
  onSubmit: (settings?: SlackSettings) => void;
}

const SlackSetup = ({
  SetupForm,
  hasSlackBot,
  hasSlackError,
  onSubmit,
}: SlackSetupProps): JSX.Element => {
  const [hasSubmitError, setHasSubmitError] = useState(false);

  const handleSubmit = async (settings?: SlackSettings) => {
    try {
      await onSubmit(settings);
    } catch (error) {
      setHasSubmitError(true);
      throw error;
    }
  };

  return (
    <SetupRoot>
      <SetupHeader
        hasSlackBot={hasSlackBot}
        hasSlackError={hasSlackError}
        hasSubmitError={hasSubmitError}
      />
      <CreateAppSection />
      <CopyManifestSection />
      <ActivateAppSection SetupForm={SetupForm} onSubmit={handleSubmit} />
    </SetupRoot>
  );
};

interface SetupHeaderProps {
  hasSlackBot: boolean;
  hasSlackError: boolean;
  hasSubmitError: boolean;
}

const SetupHeader = ({
  hasSlackBot,
  hasSlackError,
  hasSubmitError,
}: SetupHeaderProps): JSX.Element => {
  return (
    <HeaderRoot>
      <HeaderTitle>{t`Metabase on Slack`}</HeaderTitle>
      {hasSlackBot ? (
        <HeaderMessage>
          <SlackBadge hasSlackBot={hasSlackBot} hasSlackError={hasSlackError} />{" "}
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
      {hasSubmitError && (
        <BannerRoot>
          <BannerIcon name="warning" />
          <BannerText>{t`Looks like your slack channel name is incorrect. Please check your settings and try again.`}</BannerText>
        </BannerRoot>
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
      <SlackButton />
    </SetupSection>
  );
};

const CopyManifestSection = (): JSX.Element => {
  return (
    <SetupSection title={t`2. Copy the Metabase manifest`}>
      <SectionMessage>
        {jt`Copy our ${(
          <strong key="manifest">{t`Slack Manifest`}</strong>
        )} below and paste it in to create the app. In the following screen, click “${(
          <strong key="install">{t`Install to workspace`}</strong>
        )}” and authorize it.`}
      </SectionMessage>
      <SectionCode />
    </SetupSection>
  );
};

interface ActivateAppSectionProps {
  SetupForm: ComponentType<SlackSetupFormProps>;
  onSubmit: (settings?: SlackSettings) => void;
}

const ActivateAppSection = ({
  SetupForm,
  onSubmit,
}: ActivateAppSectionProps): JSX.Element => {
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
      <SetupForm onSubmit={onSubmit} />
    </SetupSection>
  );
};

export default SlackSetup;
