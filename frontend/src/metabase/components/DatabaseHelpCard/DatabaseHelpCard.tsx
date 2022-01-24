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
  engine?: string;
  isHosted?: boolean;
}

const DatabaseHelpCard = ({
  className,
  engine,
  isHosted,
}: DatabaseHelpCardProps): JSX.Element => {
  const docsUrl = getDocsUrl(engine);
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
        {t`Check out documentation for step-by-step directions on how to connect to your database.`}
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

const getDocsUrl = (engine?: string): string => {
  switch (engine) {
    case "bigquery":
      return Settings.docsUrl("administration-guide/databases/bigquery");
    case "mongo":
      return Settings.docsUrl("administration-guide/databases/mongodb");
    case "mysql":
      return Settings.docsUrl("administration-guide/databases/mysql");
    case "oracle":
      return Settings.docsUrl("administration-guide/databases/oracle");
    case "snowflake":
      return Settings.docsUrl("administration-guide/databases/snowflake");
    case "vertica":
      return Settings.docsUrl("administration-guide/databases/vertica");
    default:
      return Settings.docsUrl("administration-guide/01-managing-databases");
  }
};

export default DatabaseHelpCard;
