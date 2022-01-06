import React from "react";
import { t, jt } from "ttag";
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
  StatusSecondary,
  StatusTitle,
} from "./SlackStatus.styled";

export interface SlackStatusProps {
  token: string;
  channel: string;
  isError: boolean;
  onDelete: () => void;
}

const SlackStatus = ({ isError, onDelete }: SlackStatusProps): JSX.Element => {
  return (
    <section>
      <StatusHeader>
        <StatusPrimary>
          <StatusTitle>{t`Metabase on Slack`}</StatusTitle>
          <StatusMessage>
            <SlackBadge isError={isError} />{" "}
            {isError && (
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
    </section>
  );
};

export default SlackStatus;
