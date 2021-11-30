import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import Overworld from "../../components/Overworld/Overworld";

const mapStateToProps = () => ({
  greeting: "Howdy, Alexander",
});

export default _.compose(
  Databases.loadList(),
  connect(mapStateToProps),
)(Overworld);
