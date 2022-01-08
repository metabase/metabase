import React, { ComponentType, ReactNode, useState } from "react";
import { jt, t } from "ttag";
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
  Form: ComponentType<SlackSetupFormProps>;
  hasBot: boolean;
  hasError: boolean;
  onSubmit: () => void;
}

export interface SlackSetupFormProps {
  onSubmit: () => void;
}

const SlackSetup = ({
  Form,
  hasBot,
  hasError,
  onSubmit,
}: SlackSetupProps): JSX.Element => {
  return (
    <SetupRoot>
      <SetupHeader hasBot={hasBot} hasError={hasError} />
      <CreateAppSection />
      <CopyManifestSection />
      <ActivateAppSection Form={Form} onSubmit={onSubmit} />
    </SetupRoot>
  );
};

interface SetupHeaderProps {
  hasBot: boolean;
  hasError: boolean;
}

const SetupHeader = ({ hasBot, hasError }: SetupHeaderProps): JSX.Element => {
  return (
    <HeaderRoot>
      <HeaderTitle>{t`Metabase on Slack`}</HeaderTitle>
      {hasBot ? (
        <HeaderMessage>
          <SlackBadge hasBot={hasBot} hasError={hasError} />{" "}
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

const SetupBanner = (): JSX.Element => {
  return (
    <BannerRoot>
      <BannerIcon name="warning" />
      <BannerText>{t`Looks like your slack channel name is incorrect. Please check your settings and try again.`}</BannerText>
    </BannerRoot>
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
  Form: ComponentType<SlackSetupFormProps>;
  onSubmit: () => void;
}

const ActivateAppSection = ({
  Form,
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
      <Form onSubmit={onSubmit} />
    </SetupSection>
  );
};

export default SlackSetup;
