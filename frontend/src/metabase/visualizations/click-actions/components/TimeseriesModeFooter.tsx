import { t } from "ttag";
import type { ModeFooterComponentProps } from "metabase/visualizations/types";
import type Question from "metabase-lib/Question";
import { TimeseriesFilterWidget } from "./TimeseriesFilterWidget";
import { TimeseriesGroupingWidget } from "./TimeseriesGroupingWidget";

type Props = ModeFooterComponentProps;

export const TimeseriesModeFooter = (props: Props): JSX.Element => {
  const onChange = (question: Question) => {
    const { updateQuestion } = props;
    updateQuestion(question, { run: true });
  };
  // The first breakout is always a date.
  // See https://github.com/metabase/metabase/blob/e7363d97d6ed0ec8f5288a642e4990e85df57e79/frontend/src/metabase/visualizations/click-actions/Mode/utils.ts#L41-L44
  const [dateBreakout] = props.query.breakouts();
  const shouldHideTimeseriesGroupingWidget = dateBreakout
    .dimension()
    .isExpression();

  return (
    <div className="flex layout-centered" data-testid="timeseries-mode-bar">
      <span className="mr1">{t`View`}</span>
      <TimeseriesFilterWidget {...props} card={props.lastRunCard} />
      {!shouldHideTimeseriesGroupingWidget && (
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
