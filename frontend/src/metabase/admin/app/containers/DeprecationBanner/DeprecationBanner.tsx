import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import { Database } from "metabase-types/api";
import { State } from "metabase-types/store";
import DeprecationBanner from "../../components/DeprecationBanner";
import { hasDeprecatedDatabase, hasSlackBot } from "../../selectors";

interface Props {
  databases?: Database[];
}

const mapStateToProps = (state: State, props: Props) => ({
  hasSlackBot: hasSlackBot(state),
  hasDeprecatedDatabase: hasDeprecatedDatabase(state, props),
  isEnabled: true,
});

const mapDispatchToProps = {
  onClose: () => undefined,
};

export default _.compose(
  Databases.loadList({
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(DeprecationBanner);
