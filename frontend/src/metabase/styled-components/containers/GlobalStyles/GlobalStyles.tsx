import { connect } from "react-redux";

import type { State } from "metabase-types/store";

import GlobalStyles from "../../components/GlobalStyles";
import { getFont, getFontFiles } from "../../selectors";

const mapStateToProps = (state: State) => ({
  font: getFont(state),
  fontFiles: getFontFiles(state),
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(GlobalStyles);
