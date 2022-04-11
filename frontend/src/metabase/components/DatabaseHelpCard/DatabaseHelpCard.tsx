import React from "react";
import { jt, t } from "ttag";
import Settings from "metabase/lib/settings";
import {
  CardHeaderLink,
  CardHeaderStatic,
  CardIcon,
  CardLink,
  CardMessage,
  CardRootLink,
  CardRootStatic,
  CardTitle,
} from "./DatabaseHelpCard.styled";

export interface DatabaseHelpCardProps {
  className?: string;
  isHosted?: boolean;
}

const DatabaseHelpCard = ({
  className,
  isHosted,
}: DatabaseHelpCardProps): JSX.Element => {
  const docsUrl = Settings.docsUrl(
    "administration-guide/01-managing-databases",
  );
  const CardRoot = isHosted ? CardRootStatic : CardRootLink;
  const CardHeader = isHosted ? CardHeaderLink : CardHeaderStatic;

  return (
    <CardRoot className={className} href={isHosted ? undefined : docsUrl}>
      <CardHeader href={isHosted ? docsUrl : undefined}>
        <CardIcon name="info" />
        <CardTitle>{t`Need help connecting?`}</CardTitle>
        <CardIcon name="external" />
      </CardHeader>
      <CardMessage>
        {t`See our docs for step-by-step directions on how to connect your database.`}
      </CardMessage>
      {isHosted && (
        <CardMessage>
          {jt`Docs weren't enough? ${(
            <CardLink key="link" href="https://www.metabase.com/help/cloud">
              {t`Write us.`}
            </CardLink>
          )}`}
        </CardMessage>
      )}
    </CardRoot>
  );
};

export default DatabaseHelpCard;
