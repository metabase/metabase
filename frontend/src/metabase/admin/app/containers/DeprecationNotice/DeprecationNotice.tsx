import _ from "underscore";

import { Databases } from "metabase/entities/databases";
import type { State } from "metabase/redux/store";
import { connect } from "metabase/utils/redux";
import type Database from "metabase-lib/v1/metadata/Database";

import { disableNotice } from "../../actions";
import DeprecationNotice from "../../components/DeprecationNotice";
import {
  hasDeprecatedDatabase,
  isDeprecationNoticeEnabled,
} from "../../selectors";

interface Props {
  databases?: Database[];
}

const mapStateToProps = (state: State, props: Props) => ({
  hasDeprecatedDatabase: hasDeprecatedDatabase(state, props),
  isEnabled: isDeprecationNoticeEnabled(state),
});

const mapDispatchToProps = {
  onClose: disableNotice,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Databases.loadList({
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(DeprecationNotice);
