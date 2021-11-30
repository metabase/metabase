import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import { getUserIsAdmin } from "metabase/selectors/user";
import OurDataSection from "../../components/OurDataSection";

const mapStateToProps = state => ({
  isAdmin: getUserIsAdmin(state),
});

export default _.compose(
  Databases.loadList(),
  connect(mapStateToProps),
)(OurDataSection);
