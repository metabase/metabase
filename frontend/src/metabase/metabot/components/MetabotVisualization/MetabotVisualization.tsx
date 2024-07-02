import { connect } from "react-redux";

import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import { MetabotMode } from "metabase/visualizations/click-actions/modes/MetabotMode";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { State } from "metabase-types/store";

import { getQueryResultsError, getRawSeries } from "../../selectors";

import { FullVisualization } from "./MetabotVisualization.styled";

interface StateProps {
  rawSeries: unknown[];
  error: unknown;
  metadata: Metadata;
}

type MetabotVisualizationProps = StateProps;

const mapStateToProps = (state: State): StateProps => ({
  rawSeries: checkNotNull(getRawSeries(state)),
  metadata: getMetadata(state),
  error: getQueryResultsError(state),
});

const MetabotVisualization = ({
  rawSeries,
  metadata,
  error,
}: MetabotVisualizationProps) => {
  return (
    <FullVisualization
      showTitle
      mode={MetabotMode}
      rawSeries={rawSeries}
      metadata={metadata}
      error={error}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(MetabotVisualization);
