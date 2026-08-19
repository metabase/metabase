import { useListDatabasesQuery } from "metabase/api";
import { useDispatch, useSelector } from "metabase/redux";

import { disableNotice } from "../../actions";
import DeprecationNotice from "../../components/DeprecationNotice";
import {
  hasDeprecatedDatabase,
  isDeprecationNoticeEnabled,
} from "../../selectors";

const DeprecationNoticeContainer = () => {
  const { data: databasesData } = useListDatabasesQuery();
  const hasDeprecated = useSelector((state) =>
    hasDeprecatedDatabase(state, { databases: databasesData?.data }),
  );
  const isEnabled = useSelector(isDeprecationNoticeEnabled);
  const dispatch = useDispatch();

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
