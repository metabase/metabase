import React, { ReactNode, useState } from "react";
import { jt, t } from "ttag";
import {
  HeaderMessage,
  HeaderRoot,
  HeaderTitle,
  SectionBody,
  SectionButton,
  SectionButtonIcon,
  SectionButtonText,
  SectionCode,
  SectionHeader,
  SectionLink,
  SectionMessage,
  SectionRoot,
  SectionTitle,
  SectionToggle,
} from "./SlackAppSettings.styled";

const SlackAppSettings = (): JSX.Element => {
  return (
    <div>
      <SettingsHeader />
      <CreateAppSection />
      <CopyManifestSection />
    </div>
  );
};

const SettingsHeader = (): JSX.Element => {
  return (
    <HeaderRoot>
      <HeaderTitle>{t`Metabase on Slack`}</HeaderTitle>
      <HeaderMessage>
        {t`Bring the power of Metabase to your Slack #channels.`}{" "}
        {t`Follow these steps to connect your bot to Slack:`}
      </HeaderMessage>
    </HeaderRoot>
  );
};

interface SettingsSectionProps {
  title: string;
  children?: ReactNode;
}

const SettingsSection = ({
  title,
  children,
}: SettingsSectionProps): JSX.Element => {
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
    <SettingsSection title={t`1. Create your Slack App`}>
      <SectionMessage>
        {t`To create your Metabase integration on Slack you’ll need to set up some things.`}{" "}
        {jt`First, go to ${(
          <SectionLink href="https://api.slack.com/apps">{t`Slack Apps`}</SectionLink>
        )}, hit “${(<strong>{t`Create New App`}</strong>)}” and pick “${(
          <strong>{t`From an app manifest`}</strong>
        )}”.`}
      </SectionMessage>
      <SectionButton
        className="Button Button--primary"
        href="https://api.slack.com/apps"
      >
        <SectionButtonText>{`Open Slack Apps`}</SectionButtonText>
        <SectionButtonIcon name="external" />
      </SectionButton>
    </SettingsSection>
  );
};

const CopyManifestSection = (): JSX.Element => {
  return (
    <SettingsSection title={t`2. Copy the Metabase manifest`}>
      <SectionMessage>
        {jt`Copy our ${(
          <strong>{t`Slack Manifest`}</strong>
        )} below and paste it in to create the app. In the following screen, click “${(
          <strong>{t`Install to workspace`}</strong>
        )}” and authorize it.`}
      </SectionMessage>
      <SectionCode />
    </SettingsSection>
  );
};

export default SlackAppSettings;
