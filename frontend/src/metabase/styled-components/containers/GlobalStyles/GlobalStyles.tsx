import { connect } from "react-redux";
import type { State } from "metabase-types/store";
import { getFont, getFontFiles } from "../../selectors";
import { GlobalStylesView } from "../../components/GlobalStylesView";

const mapStateToProps = (state: State) => ({
  font: getFont(state),
  fontFiles: getFontFiles(state),
});

export const GlobalStyles = connect(mapStateToProps)(GlobalStylesView);
