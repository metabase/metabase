import { t, jt } from "ttag";
import { BoldCode } from "metabase/components/Code";
import * as Urls from "metabase/lib/urls";
import Link from "metabase/core/components/Link";
import { isEmpty } from "metabase/lib/validate";
import type Database from "metabase-lib/metadata/Database";
import { ImpersonationAlert } from "./ImpersonationWarning.styled";

interface ImpersonationWarningProps {
  database: Database;
}

export const ImpersonationWarning = ({
  database,
}: ImpersonationWarningProps) => {
  const databaseUser = database.details.user;

  const text = isEmpty(databaseUser)
    ? t`Make sure the main database credential has access to everything different user groups may need access to. It's what Metabase uses to sync table information.`
    : jt`${(
        <BoldCode key="1" size={13}>
          {databaseUser}
        </BoldCode>
      )} is the database user Metabase is using to connect to your  ${(
        <BoldCode key="2" size={13}>
          {database.name}
        </BoldCode>
      )} database. Make sure that ${(
        <BoldCode key="3" size={13}>
          {database.details.user}
        </BoldCode>
      )} has access to everything in ${(
        <BoldCode key="4" size={13}>
          {database.name}
        </BoldCode>
      )} that all Metabase groups may need access to, as that database user account is what Metabase uses to sync table information.`;

  return (
    <ImpersonationAlert icon="warning" variant="warning">
      {text}{" "}
      <Link
        className="link"
        to={Urls.editDatabase(database.id) + (databaseUser ? "#user" : "")}
      >{t`Edit settings`}</Link>
    </ImpersonationAlert>
  );
};
