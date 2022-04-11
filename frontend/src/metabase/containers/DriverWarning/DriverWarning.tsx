import { connect } from "react-redux";
import DriverWarning from "metabase/components/DriverWarning";
import { Engine } from "metabase-types/api";
import { State } from "metabase-types/store";

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
