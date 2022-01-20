import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import { Database } from "metabase-types/api";
import { State } from "metabase-types/store";
import DeprecationNotice from "../../components/DeprecationNotice";
import { disableNotice } from "../../actions";
import {
  hasDeprecatedDatabase,
  hasSlackBot,
  isNoticeEnabled,
} from "../../selectors";

interface Props {
  databases?: Database[];
}

const mapStateToProps = (state: State, props: Props) => ({
  hasSlackBot: hasSlackBot(state),
  hasDeprecatedDatabase: hasDeprecatedDatabase(state, props),
  isEnabled: isNoticeEnabled(state),
});

const mapDispatchToProps = {
  onClose: disableNotice,
};

export default _.compose(
  Databases.loadList({
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(DeprecationNotice);
