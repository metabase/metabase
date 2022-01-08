import React, { ComponentType, ReactNode, useCallback, useState } from "react";
import { jt, t } from "ttag";
import Tooltip from "metabase/components/Tooltip";
import SlackBadge from "../SlackBadge";
import SlackButton from "../SlackButton";
import { useCopyTooltip } from "../../hooks/use-copy-tooltip";
import {
  BannerIcon,
  BannerRoot,
  BannerText,
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
  SetupRoot,
} from "./SlackSetup.styled";

export interface SlackSetupProps {
  Form: ComponentType<SlackSetupFormProps>;
  hasBot: boolean;
  hasTokenError: boolean;
}

export interface SlackSetupFormProps {
  onSubmitFail?: () => void;
}

const SlackSetup = ({
  Form,
  hasBot,
  hasTokenError,
}: SlackSetupProps): JSX.Element => {
  const [hasSubmitError, setHasSubmitError] = useState(false);
  const handleSubmitFail = useCallback(() => setHasSubmitError(true), []);

  return (
    <SetupRoot>
      <SetupHeader
        hasBot={hasBot}
        hasTokenError={hasTokenError}
        hasSubmitError={hasSubmitError}
      />
      <CreateAppSection />
      <CopyManifestSection manifest="" />
      <ActivateAppSection Form={Form} onSubmitFail={handleSubmitFail} />
    </SetupRoot>
  );
};

interface SetupHeaderProps {
  hasBot: boolean;
  hasTokenError: boolean;
  hasSubmitError: boolean;
}

const SetupHeader = ({
  hasBot,
  hasTokenError,
  hasSubmitError,
}: SetupHeaderProps): JSX.Element => {
  return (
    <HeaderRoot>
      <HeaderTitle>{t`Metabase on Slack`}</HeaderTitle>
      {hasBot ? (
        <HeaderMessage>
          <SlackBadge hasBot={hasBot} hasError={hasTokenError} />{" "}
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

export interface CopyManifestSectionProps {
  manifest: string;
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
  Form: ComponentType<SlackSetupFormProps>;
  onSubmitFail: () => void;
}

const ActivateAppSection = ({
  Form,
  onSubmitFail,
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
      <Form onSubmitFail={onSubmitFail} />
    </SetupSection>
  );
};

export default SlackSetup;
