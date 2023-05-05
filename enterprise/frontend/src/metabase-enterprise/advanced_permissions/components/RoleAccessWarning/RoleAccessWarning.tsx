import React from "react";
import { t } from "ttag";
import { Database } from "metabase-types/api";
import * as Urls from "metabase/lib/urls";
import Link from "metabase/core/components/Link";
import { isEmpty } from "metabase/lib/validate";
import { RoleAttributeMappingAlert } from "./RoleAccessWarning.styled";

interface RoleAccessWarningProps {
  database: Database;
}

const RoleAccessWarning = ({ database }: RoleAccessWarningProps) => {
  const databaseUser = database.details.user;

  const text = isEmpty(databaseUser)
    ? t`Make sure the main database credential has access to everything different user groups may need access to. It's what Metabase uses to sync table information.`
    : t`${databaseUser} is the database user Metabase is using to connect to ${database.name}. Make sure that ${database.details.user} has access to everything in ${database.name} that all Metabase groups may need access to, as that database user account is what Metabase uses to sync table information.`;

  return (
    <RoleAttributeMappingAlert icon="warning" variant="warning">
      {text}{" "}
      <Link
        className="link"
        to={Urls.editDatabase(database.id) + (databaseUser ? "#user" : "")}
      >{t`Edit settings`}</Link>
    </RoleAttributeMappingAlert>
  );
};

export default RoleAccessWarning;
