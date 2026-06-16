import { jt, t } from "ttag";

import { Alert } from "metabase/common/components/Alert";
import { Link } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { Box, Code } from "metabase/ui";
import * as Urls from "metabase/urls";
import { isEmpty } from "metabase/utils/validate";
import type Database from "metabase-lib/v1/metadata/Database";

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
    <Code c="core-brand" key="1" fw="bold" fz={13}>
      {database.name}
    </Code>
  )} database using the credentials for the Redshift user ${(
    <Code c="core-brand" key="2" fw="bold" fz={13}>
      {String(databaseUser)}
    </Code>
  )}. For impersonation to work,  ${(
    <Code c="core-brand" key="3" fw="bold" fz={13}>
      {String(databaseUser)}
    </Code>
  )} must be a superuser in Redshift.`;

  // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings
  const regularWarning = jt`${(
    <Code c="core-brand" key="1" fw="bold" fz={13}>
      {String(databaseUser)}
    </Code>
  )} is the database user Metabase is using to connect to your  ${(
    <Code c="core-brand" key="2" fw="bold" fz={13}>
      {database.name}
    </Code>
  )} database. Make sure that ${(
    <Code c="core-brand" key="3" fw="bold" fz={13}>
      {String(databaseUser)}
    </Code>
  )} has access to everything in ${(
    <Code c="core-brand" key="4" fw="bold" fz={13}>
      {database.name}
    </Code>
  )} that all Metabase groups may need access to, as that database user account is what Metabase uses to sync table information.`;

  const warningText = isRedshift ? redshiftWarning : regularWarning;

  return (
    <Box mb="md">
      <Alert icon="warning" variant="warning">
        {isEmpty(databaseUser) ? emptyText : warningText}{" "}
        <Link
          className={CS.link}
          to={Urls.editDatabase(database.id) + (databaseUser ? "#user" : "")}
        >{t`Edit settings`}</Link>
      </Alert>
    </Box>
  );
};
