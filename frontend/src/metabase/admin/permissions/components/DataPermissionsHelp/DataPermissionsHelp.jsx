import React from "react";
import { t, jt } from "ttag";

import { color } from "metabase/lib/colors";
import MetabaseSettings from "metabase/lib/settings";

import {
  PermissionIcon,
  DataPermissionsHelpRoot,
  DataPermissionsHelpFooter,
  DataPermissionsHelpContent,
  DataPermissionsHelpLink,
  DataPermissionsHelpLinkIcon,
} from "./DataPermissionsHelp.styled";

export const DataPermissionsHelp = () => (
  <DataPermissionsHelpRoot>
    <DataPermissionsHelpContent>
      <h2>{t`About data permissions`}</h2>
      <p>{t`Each of your user groups can has a level of access for each of your databases on the tables they contain.`}</p>
      <p>{jt`Users can be members of multiple groups, and are given the ${(
        <strong>{t`most permissive`}</strong>
      )} level of access for a database or table across all the groups they’re a member of.`}</p>
      <p>{t`Unless a user group has “no access” for a given database or table, they’ll be able to view any saved questions based on that data if they have access to the collection it’s saved in.`}</p>
      <h2>{t`Access levels`}</h2>

      <h3>
        <PermissionIcon name="check" style={{ color: color("success") }} />
        {t`Unrestricted access`}
      </h3>
      <p>{t`Users can use the visual query builder to questions based on all tables in this database. A user group must have Unrestricted access for a database if you want to give them access to the SQL/native query editor.`}</p>

      <h3>
        <PermissionIcon name="permissions_limited" color="warning" />
        {t`Granular access`}
      </h3>
      <p>{t`Restrict user access to specific tables in a database. When you select this option, you’ll be taken to the table-level view of that database to make more granular options.`}</p>

      <h3>
        <PermissionIcon name="eye" color="accent5" />
        {t`No self-service access`}
      </h3>
      <p>{t`Prevent users create new ad hoc queries or questions based on that data, or see that data in the Browse Data screen. But users can still see existing saved questions and charts based on that data in Collections that they have access to.`}</p>

      <h3>
        <PermissionIcon name="close" color="danger" />
        {t`No access`}
      </h3>
      <p>{t`Ensure users can’t ever see the data from a certain database regardless of their permissions at the collection level. Keep in mind that if the user is part of another group with data access, it will take precedence and their access will not be blocked.`}</p>

      <p>{t`Only available in certain Metabase plans.`}</p>
    </DataPermissionsHelpContent>

    <DataPermissionsHelpFooter>
      <DataPermissionsHelpLink
        href={MetabaseSettings.docsUrl(
          "administration-guide/05-setting-permissions",
        )}
        target="_blank"
      >
        <DataPermissionsHelpLinkIcon size={28} name="reference" />
        {t`Learn more about permissions`}
      </DataPermissionsHelpLink>
    </DataPermissionsHelpFooter>
  </DataPermissionsHelpRoot>
);
