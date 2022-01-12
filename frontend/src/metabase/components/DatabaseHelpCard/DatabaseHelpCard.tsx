import React from "react";
import { t } from "ttag";
import Settings from "metabase/lib/settings";
import {
  CardBody,
  CardHeader,
  CardIcon,
  CardRoot,
  CardTitle,
} from "./DatabaseHelpCard.styled";

export interface DatabaseHelpCardProps {
  className?: string;
  engine?: string;
}

const DatabaseHelpCard = ({
  className,
  engine,
}: DatabaseHelpCardProps): JSX.Element => {
  const docsUrl = getDocsUrl(engine);

  return (
    <CardRoot className={className} href={docsUrl}>
      <CardHeader>
        <CardIcon name="info" />
        <CardTitle>{t`Need help connecting?`}</CardTitle>
        <CardIcon name="external" />
      </CardHeader>
      <CardBody>
        {t`Check out documentation for step-by-step directions on how to connect to your database.`}
      </CardBody>
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
