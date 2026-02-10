import { jt, t } from "ttag";

import { BoldCode } from "metabase/common/components/Code";
import { Link } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import * as Urls from "metabase/lib/urls";
import { isEmpty } from "metabase/lib/validate";
import type Database from "metabase-lib/v1/metadata/Database";

import { ImpersonationAlert } from "./ImpersonationWarning.styled";

interface ImpersonationWarningProps {
  database: Database;
}

export const ImpersonationWarning = ({
  database,
}: ImpersonationWarningProps) => {
  const databaseUser =
    database.details?.user !== null && database.details?.user !== undefined
      ? String(database.details.user)
      : null;
  const isRedshift = database.engine === "redshift";

  // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings
  const emptyText = t`Make sure the main database credential has access to everything different user groups may need access to. It's what Metabase uses to sync table information.`;

  // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings
  const redshiftWarning = jt`You’re connecting Metabase to the ${(
    <BoldCode key="2" size="13px">
      {database.name}
    </BoldCode>
  )} database using the credentials for the Redshift user ${(
    <BoldCode key="3" size="13px">
      {databaseUser}
    </BoldCode>
  )}. For impersonation to work,  ${(
    <BoldCode key="3" size="13px">
      {databaseUser}
    </BoldCode>
  )} must be a superuser in Redshift.`;

  // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings
  const regularWarning = jt`${(
    <BoldCode key="1" size="13px">
      {databaseUser}
    </BoldCode>
  )} is the database user Metabase is using to connect to your  ${(
    <BoldCode key="2" size="13px">
      {database.name}
    </BoldCode>
  )} database. Make sure that ${(
    <BoldCode key="3" size="13px">
      {databaseUser}
    </BoldCode>
  )} has access to everything in ${(
    <BoldCode key="4" size="13px">
      {database.name}
    </BoldCode>
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
