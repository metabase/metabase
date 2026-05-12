import { useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";

export const AdminEmail = () => {
  const adminEmail = useSetting("admin-email");

  if (!adminEmail) {
    return null;
  }

  return (
    <span className={QueryBuilderS.QueryErrorAdminEmail}>
      <a className={CS.noDecoration} href={`mailto:${adminEmail}`}>
        {adminEmail}
      </a>
    </span>
  );
};
