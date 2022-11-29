import { connect } from "react-redux";
import { Engine } from "metabase-types/api";
import { State } from "metabase-types/store";
import DriverWarning from "../../components/DriverWarning";

export interface DriverWarningProps {
  engine?: string;
  hasBorder?: boolean;
  onChange?: (engine: string) => void;
}

interface DriverWarningStateProps {
  engines: Record<string, Engine>;
}

const mapStateToProps = (state: State) => ({
  engines: state.settings.values.engines,
});

export default connect<
  DriverWarningStateProps,
  unknown,
  DriverWarningProps,
  State
>(mapStateToProps)(DriverWarning);
