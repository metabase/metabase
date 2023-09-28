import { t } from "ttag";
import type { ModeFooterComponentProps } from "metabase/modes/types";
import TimeseriesFilterWidget from "metabase/modes/components/TimeseriesFilterWidget";
import TimeseriesGroupingWidget from "metabase/modes/components/TimeseriesGroupingWidget";
import type Question from "metabase-lib/Question";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";

type Props = ModeFooterComponentProps;

export const TimeseriesModeFooter = (props: Props): JSX.Element | null => {
  const onChange = (question: Question) => {
    const { updateQuestion } = props;
    updateQuestion(question, { run: true });
  };

  // We could encounter stale `mode` e.g. when converting a question from GUI to native,
  // the `mode` would remain `timeseries` when it should have been `native` instead.
  // So we shouldn't assume we'll always get time series question here.
  if (!(props.query instanceof StructuredQuery)) {
    return null;
  }
  const [breakout] = props.query.breakouts();
  if (!breakout) {
    return null;
  }
  const hasTimeSeriesGroupingWidget = !breakout.dimension().isExpression();

  return (
    <div className="flex layout-centered" data-testid="time-series-mode-footer">
      <span className="mr1">{t`View`}</span>
      <TimeseriesFilterWidget {...props} card={props.lastRunCard} />
      {hasTimeSeriesGroupingWidget && (
        <>
          <span className="mx1">{t`by`}</span>
          <TimeseriesGroupingWidget
            {...props}
            onChange={onChange}
            card={props.lastRunCard}
          />
        </>
      )}
    </div>
  );
};
