import { connect } from "react-redux";
import DriverWarning from "metabase/components/DriverWarning";
import { getSetting } from "metabase/selectors/settings";
import type { Engine } from "metabase-types/api";
import type { State } from "metabase-types/store";

export interface DriverWarningProps {
  engine?: string;
  hasBorder?: boolean;
  onChange?: (engine: string) => void;
}

interface DriverWarningStateProps {
  engines: Record<string, Engine>;
}

const mapStateToProps = (state: State) => ({
  engines: getSetting(state, "engines"),
});

export default connect<
  DriverWarningStateProps,
  unknown,
  DriverWarningProps,
  State
>(mapStateToProps)(DriverWarning);
