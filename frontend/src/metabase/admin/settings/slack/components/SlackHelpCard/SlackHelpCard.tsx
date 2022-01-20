import React from "react";
import { t } from "ttag";
import Settings from "metabase/lib/settings";
import {
  CardBody,
  CardHeader,
  CardIcon,
  CardRoot,
  CardTitle,
} from "./SlackHelpCard.styled";

export interface SlackHelpCardProps {
  className?: string;
}

const SlackHelpCard = ({ className }: SlackHelpCardProps): JSX.Element => {
  const docsUrl = Settings.docsUrl("administration-guide/09-setting-up-slack");

  return (
    <CardRoot className={className} href={docsUrl}>
      <CardHeader>
        <CardIcon name="info" />
        <CardTitle>{t`Need help?`}</CardTitle>
        <CardIcon name="external" />
      </CardHeader>
      <CardBody>{t`Check out our docs on how to connect to Slack.`}</CardBody>
    </CardRoot>
  );
};

export default SlackHelpCard;
