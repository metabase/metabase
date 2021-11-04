import _ from "underscore";
import { getXraysEnabled } from "metabase/selectors/settings";
import { getSampleDatabase } from "../../selectors";
import Databases from "metabase/entities/databases";
import { connect } from "react-redux";

const listOptions = {
  query: { include: "tables" },
};

const mapStateToProps = state => ({
  sampleDatabase: getSampleDatabase(state),
  xraysEnabled: getXraysEnabled(state),
});

export default _.compose(
  Databases.loadList(listOptions),
  connect(mapStateToProps),
);
