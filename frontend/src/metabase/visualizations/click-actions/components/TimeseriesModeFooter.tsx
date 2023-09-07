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

  return (
    <div className="flex layout-centered" data-testid="timeseries-mode-bar">
      <span className="mr1">{t`View`}</span>
      <TimeseriesFilterWidget {...props} card={props.lastRunCard} />
      <span className="mx1">{t`by`}</span>
      <TimeseriesGroupingWidget
        {...props}
        onChange={onChange}
        card={props.lastRunCard}
      />
    </div>
  );
};
