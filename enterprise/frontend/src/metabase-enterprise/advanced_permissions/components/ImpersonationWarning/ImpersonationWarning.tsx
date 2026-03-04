import { jt, t } from "ttag";

import { Link } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import * as Urls from "metabase/lib/urls";
import { isEmpty } from "metabase/lib/validate";
import { Code } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";

import { ImpersonationAlert } from "./ImpersonationWarning.styled";

interface ImpersonationWarningProps {
  database: Database;
}

export const ImpersonationWarning = ({
  database,
}: ImpersonationWarningProps) => {
  const databaseUser = database.details && database.details.user;
  const isRedshift = database.engine === "redshift";

  // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings
  const emptyText = t`Make sure the main database credential has access to everything different user groups may need access to. It's what Metabase uses to sync table information.`;

  // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings
  const redshiftWarning = jt`You’re connecting Metabase to the ${(
    <Code c="brand" key="1" fw="bold" fz={13}>
      {database.name}
    </Code>
  )} database using the credentials for the Redshift user ${(
    <Code c="brand" key="2" fw="bold" fz={13}>
      {String(databaseUser)}
    </Code>
  )}. For impersonation to work,  ${(
    <Code c="brand" key="3" fw="bold" fz={13}>
      {String(databaseUser)}
    </Code>
  )} must be a superuser in Redshift.`;

  // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings
  const regularWarning = jt`${(
    <Code c="brand" key="1" fw="bold" fz={13}>
      {String(databaseUser)}
    </Code>
  )} is the database user Metabase is using to connect to your  ${(
    <Code c="brand" key="2" fw="bold" fz={13}>
      {database.name}
    </Code>
  )} database. Make sure that ${(
    <Code c="brand" key="3" fw="bold" fz={13}>
      {String(databaseUser)}
    </Code>
  )} has access to everything in ${(
    <Code c="brand" key="4" fw="bold" fz={13}>
      {database.name}
    </Code>
  )} that all Metabase groups may need access to, as that database user account is what Metabase uses to sync table information.`;

  const warningText = isRedshift ? redshiftWarning : regularWarning;

  return (
    <ImpersonationAlert icon="warning" variant="warning">
      {isEmpty(databaseUser) ? emptyText : warningText}{" "}
      <Link
        className={CS.link}
        to={Urls.editDatabase(database.id) + (databaseUser ? "#user" : "")}
      >{t`Edit settings`}</Link>
    </ImpersonationAlert>
  );
};
