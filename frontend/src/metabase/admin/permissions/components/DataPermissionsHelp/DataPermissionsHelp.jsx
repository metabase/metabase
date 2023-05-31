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
      <p>{t`Each of your user groups can have a level of access for each of your databases on the tables they contain.`}</p>
      <p>{jt`Users can be members of multiple groups, and are given the ${(
        <strong>{t`most permissive`}</strong>
      )} level of access for a database or table across all the groups they’re a member of.`}</p>
      <p>{t`Unless a user group's access for a given database is set to “block", they’ll be able to view any saved question based on that data if they have access to the collection it’s saved in.`}</p>
      <h2>{t`Access levels`}</h2>

      <h3>
        <PermissionIcon name="check" style={{ color: color("success") }} />
        {t`Unrestricted access`}
      </h3>
      <p>{t`Users can use the visual query builder to ask questions based on all tables in this database. A user group must have Unrestricted access for a database if you want to give them access to the SQL/native query editor.`}</p>

      <h3>
        <PermissionIcon name="permissions_limited" color="warning" />
        {t`Granular access`}
      </h3>
      <p>{t`Restrict user access to specific tables in a database. When you select this option, you’ll be taken to the table-level view of that database to set the access level for each table.`}</p>

      <h3>
        <PermissionIcon name="eye" color="accent5" />
        {t`No self-service access`}
      </h3>
      <p>{t`Prevent users from creating new ad hoc queries or questions based on this data, or from seeing this data in the Browse Data screen. Users with this level of access can still see saved questions and charts based on this data in Collections they have access to.`}</p>

      <h3>
        <PermissionIcon name="close" color="danger" />
        {t`Block`}
      </h3>
      <p>{t`Ensure users can’t ever see the data from this database regardless of their permissions at the Collection level. Keep in mind that if a user belongs to another group that does have data access, that setting will take precedence, and the user's access will not be blocked.`}</p>

      <p>{t`Only available in certain Metabase plans.`}</p>
    </DataPermissionsHelpContent>

    <DataPermissionsHelpFooter>
      <DataPermissionsHelpLink
        href={MetabaseSettings.docsUrl("permissions/introduction")}
        target="_blank"
      >
        <DataPermissionsHelpLinkIcon size={28} name="reference" />
        {t`Learn more about permissions`}
      </DataPermissionsHelpLink>
    </DataPermissionsHelpFooter>
  </DataPermissionsHelpRoot>
);
