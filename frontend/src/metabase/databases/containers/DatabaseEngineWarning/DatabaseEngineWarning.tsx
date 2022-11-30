import { connect } from "react-redux";
import { getSetting } from "metabase/selectors/settings";
import type { Engine } from "metabase-types/api";
import type { State } from "metabase-types/store";
import DatabaseEngineWarning from "../../components/DatabaseEngineWarning";

export interface DatabaseEngineWarningProps {
  engineKey?: string;
  hasBorder?: boolean;
  onChange?: (engine: string) => void;
}

interface DatabaseEngineWarningStateProps {
  engines: Record<string, Engine>;
}

const mapStateToProps = (state: State) => ({
  engines: getSetting(state, "engines"),
});

export default connect<
  DatabaseEngineWarningStateProps,
  unknown,
  DatabaseEngineWarningProps,
  State
>(mapStateToProps)(DatabaseEngineWarning);
