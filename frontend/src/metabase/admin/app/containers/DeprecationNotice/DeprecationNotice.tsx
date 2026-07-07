import { useListDatabasesQuery } from "metabase/api";
import { useDispatch, useSelector } from "metabase/redux";
import { useRouter } from "metabase/router";
import { getMetadata } from "metabase/selectors/metadata";

import { disableNotice } from "../../actions";
import DeprecationNotice from "../../components/DeprecationNotice";
import {
  hasDeprecatedDatabase,
  isDeprecationNoticeEnabled,
} from "../../selectors";

const DeprecationNoticeContainer = () => {
  const { location } = useRouter();
  const isToolsApp = location.pathname.startsWith("/admin/tools");

  useListDatabasesQuery();
  const databases = useSelector((state) => getMetadata(state).databasesList());
  const hasDeprecated = useSelector((state) =>
    hasDeprecatedDatabase(state, { databases }),
  );
  const isEnabled = useSelector(isDeprecationNoticeEnabled);
  const dispatch = useDispatch();

  if (isToolsApp) {
    return null;
  }

  return (
    <DeprecationNotice
      hasDeprecatedDatabase={hasDeprecated}
      isEnabled={isEnabled}
      onClose={() => dispatch(disableNotice())}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DeprecationNoticeContainer;
