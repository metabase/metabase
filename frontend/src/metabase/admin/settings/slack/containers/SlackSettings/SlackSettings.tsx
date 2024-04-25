import { connect } from "react-redux";

import type { State } from "metabase-types/store";

import { loadManifest } from "../../actions";
import SlackSettings from "../../components/SlackSettings";
import { hasSlackAppToken } from "../../selectors";

const mapStateToProps = (state: State) => ({
  isApp: hasSlackAppToken(state),
});

const mapDispatchToProps = (dispatch: any) => ({
  onLoadManifest: () => dispatch(loadManifest()),
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(SlackSettings);
