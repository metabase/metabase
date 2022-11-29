import { connect } from "react-redux";
import { Engine } from "metabase-types/api";
import { State } from "metabase-types/store";
import DatabaseEngineWarning from "../../components/DatabaseEngineWarning";

export interface DatabaseEngineWarningProps {
  engine?: string;
  hasBorder?: boolean;
  onChange?: (engine: string) => void;
}

interface DatabaseEngineWarningStateProps {
  engines: Record<string, Engine>;
}

const mapStateToProps = (state: State) => ({
  engines: state.settings.values.engines,
});

export default connect<
  DatabaseEngineWarningStateProps,
  unknown,
  DatabaseEngineWarningProps,
  State
>(mapStateToProps)(DatabaseEngineWarning);
