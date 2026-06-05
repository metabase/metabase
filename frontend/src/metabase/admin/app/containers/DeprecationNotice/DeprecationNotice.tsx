import { useListDatabasesQuery } from "metabase/api";
import { useDispatch, useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";

import { disableNotice } from "../../actions";
import DeprecationNotice from "../../components/DeprecationNotice";
import {
  hasDeprecatedDatabase,
  isDeprecationNoticeEnabled,
} from "../../selectors";

const DeprecationNoticeContainer = () => {
  useListDatabasesQuery();
  const databases = useSelector((state) => getMetadata(state).databasesList());
  const hasDeprecated = useSelector((state) =>
    hasDeprecatedDatabase(state, { databases }),
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
