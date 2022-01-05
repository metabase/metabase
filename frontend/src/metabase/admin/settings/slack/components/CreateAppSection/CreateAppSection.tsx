import React from "react";
import { jt, t } from "ttag";
import SlackSection from "../SlackSection";
import {
  SectionButton,
  SectionButtonIcon,
  SectionButtonText,
  SectionLink,
  SectionMessage,
} from "./CreateAppSection.styled";

const CreateAppSection = (): JSX.Element => {
  return (
    <SlackSection title={t`1. Create your Slack App`}>
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
    </SlackSection>
  );
};

export default CreateAppSection;
