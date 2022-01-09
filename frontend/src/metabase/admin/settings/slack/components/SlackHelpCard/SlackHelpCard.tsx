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

const SlackHelpCard = (): JSX.Element => {
  const docsUrl = Settings.docsUrl("administration-guide/09-setting-up-slack");

  return (
    <CardRoot href={docsUrl}>
      <CardHeader>
        <CardIcon name="info" />
        <CardTitle>{t`Need help?`}</CardTitle>
        <CardIcon name="external" />
      </CardHeader>
      <CardBody>
        {t`Check out documentation directions on how to create your metabase bot on slack.`}
      </CardBody>
    </CardRoot>
  );
};

export default SlackHelpCard;
