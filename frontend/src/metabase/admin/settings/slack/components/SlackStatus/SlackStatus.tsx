import React, { ComponentType } from "react";
import { jt, t } from "ttag";
import Button from "metabase/components/Button";
import ExternalLink from "metabase/components/ExternalLink";
import SlackBadge from "../SlackBadge";
import SlackButton from "../SlackButton";
import {
  StatusFooter,
  StatusHeader,
  StatusMessage,
  StatusMessageText,
  StatusPrimary,
  StatusRoot,
  StatusSecondary,
  StatusTitle,
} from "./SlackStatus.styled";

export interface SlackStatusProps {
  Form: ComponentType;
  hasError: boolean;
  onDelete: () => void;
}

const SlackStatus = ({ hasError, onDelete }: SlackStatusProps): JSX.Element => {
  return (
    <StatusRoot>
      <StatusHeader>
        <StatusPrimary>
          <StatusTitle>{t`Metabase on Slack`}</StatusTitle>
          <StatusMessage>
            <SlackBadge hasError={hasError} />{" "}
            {hasError && (
              <StatusMessageText>
                {jt`Need help? ${(
                  <ExternalLink href="https://www.metabase.com/docs/latest/administration-guide/09-setting-up-slack.html">
                    {t`See our docs`}
                  </ExternalLink>
                )}.`}
              </StatusMessageText>
            )}
          </StatusMessage>
        </StatusPrimary>
        <StatusSecondary>
          <SlackButton />
        </StatusSecondary>
      </StatusHeader>
      <StatusFooter>
        <Button onClick={onDelete}>{t`Delete Slack App`}</Button>
      </StatusFooter>
    </StatusRoot>
  );
};

export default SlackStatus;
