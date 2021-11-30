import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import Landing from "../../components/Landing";

const mapStateToProps = () => ({
  greeting: "Howdy, Alexander",
});

export default _.compose(
  Databases.loadList(),
  connect(mapStateToProps),
)(Landing);
