import { connect } from "react-redux";
import { State } from "metabase-types/store";
import { getFont, getFontFiles } from "../../selectors";
import GlobalStyles from "../../components/GlobalStyles";

const mapStateToProps = (state: State) => ({
  font: getFont(state),
  fontFiles: getFontFiles(state),
});

export default connect(mapStateToProps)(GlobalStyles);
