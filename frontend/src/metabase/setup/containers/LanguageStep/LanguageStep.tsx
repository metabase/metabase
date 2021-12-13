import { connect } from "react-redux";
import { getLocales } from "../../selectors";
import LanguageStep from "../../components/LanguageStep";

const mapStateToProps = (state: any) => ({
  locales: getLocales(state),
});

export default connect(mapStateToProps)(LanguageStep);
