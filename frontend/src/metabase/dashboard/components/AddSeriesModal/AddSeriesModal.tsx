import cx from "classnames";
import { getIn } from "icepick";
import { Component } from "react";
import { t } from "ttag";

import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { color } from "metabase/lib/colors";
import Visualization from "metabase/visualizations/components/Visualization";
import type {
  Card,
  DashCardDataMap,
  DashCardId,
  QuestionDashboardCard,
} from "metabase-types/api";

import { QuestionList } from "./QuestionList";

/**
 * The first series is the base dashcard.card.
 * It does not make sense to remove it in this modal as it
 * represents the dashboard card the modal was opened for.
 */
const CAN_REMOVE_SERIES = (seriesIndex: number) => seriesIndex > 0;

export interface Props {
  dashcard: QuestionDashboardCard;
  dashcardData: DashCardDataMap;
  fetchCardData: (
    card: Card,
    dashcard: QuestionDashboardCard,
    options: {
      clearCache?: boolean;
      ignoreCache?: boolean;
      reload?: boolean;
    },
  ) => Promise<unknown>;
  setDashCardAttributes: (options: {
    id: DashCardId;
    attributes: Partial<QuestionDashboardCard>;
  }) => void;
  onClose: () => void;
}

interface State {
  error: unknown;
  isLoading: boolean;
  series: NonNullable<QuestionDashboardCard["series"]>;
}

export class AddSeriesModal extends Component<Props, State> {
  constructor(props: Props, context: unknown) {
    super(props, context);

    this.state = {
      error: null,
      series: props.dashcard.series || [],
      isLoading: false,
    };
  }

  static defaultProps = {};

  handleQuestionSelectedChange = async (card: Card, selected: boolean) => {
    const { dashcard, dashcardData } = this.props;

    if (!selected) {
      this.setState({
        series: this.state.series.filter(c => c.id !== card.id),
      });

      MetabaseAnalytics.trackStructEvent("Dashboard", "Remove Series");
      return;
    }

    if (getIn(dashcardData, [dashcard.id, card.id]) === undefined) {
      this.setState({ isLoading: true });
      await this.props.fetchCardData(card, dashcard, {
        reload: false,
        clearCache: true,
      });
    }

    this.setState({
      isLoading: false,
      series: this.state.series.concat(card),
    });

    MetabaseAnalytics.trackStructEvent(
      "Dashboard",
      "Add Series",
      card.display + ", success",
    );
  };

  handleRemoveSeries = (_event: MouseEvent, removedIndex: number) => {
    /**
     * The first series is the base dashcard.card - it's not included
     * in the this.state.series array.
     *
     * @see "series" definition in "render" function
     */
    const actualRemovedIndex = removedIndex - 1;

    this.setState({
      series: [
        ...this.state.series.slice(0, actualRemovedIndex),
        ...this.state.series.slice(actualRemovedIndex + 1),
      ],
    });
    MetabaseAnalytics.trackStructEvent("Dashboard", "Remove Series");
  };

  handleDone = () => {
    this.props.setDashCardAttributes({
      id: this.props.dashcard.id,
      attributes: { series: this.state.series },
    });
    this.props.onClose();
    MetabaseAnalytics.trackStructEvent(
      "Dashboard",
      "Edit Series Modal",
      "done",
    );
  };

  render() {
    const { dashcard, dashcardData } = this.props;

    const series = [dashcard.card]
      .concat(this.state.series)
      .map(card => ({
        card: card,
        data: getIn(dashcardData, [dashcard.id, card.id, "data"]),
      }))
      .filter(s => !!s.data);

    return (
      <div className={cx(CS.spread, CS.flex)}>
        <div className={cx(CS.flex, CS.flexColumn, CS.flexFull)}>
          <div
            className={cx(
              CS.flexNoShrink,
              CS.h3,
              CS.pl4,
              CS.pt4,
              CS.pb2,
              CS.textBold,
            )}
          >
            Edit data
          </div>
          <div className={cx(CS.flexFull, CS.ml2, CS.mr1, CS.relative)}>
            <Visualization
              canRemoveSeries={CAN_REMOVE_SERIES}
              className={CS.spread}
              errorMessageOverride={
                series.length > 1
                  ? t`Unable to combine these questions`
                  : undefined
              }
              rawSeries={series}
              showTitle
              isDashboard
              showAllLegendItems
              onRemoveSeries={this.handleRemoveSeries}
            />
            {this.state.isLoading && (
              <div
                className={cx(CS.spread, CS.flex, CS.layoutCentered)}
                style={{ backgroundColor: color("bg-white") }}
              >
                <div
                  className={cx(
                    CS.h3,
                    CS.rounded,
                    CS.bordered,
                    CS.p3,
                    CS.bgWhite,
                    CS.shadowed,
                  )}
                >
                  {t`Applying Question`}
                </div>
              </div>
            )}
          </div>
          <div className={cx(CS.flexNoShrink, CS.pl4, CS.pb4, CS.pt1)}>
            <button
              className={cx(ButtonsS.Button, ButtonsS.ButtonPrimary)}
              onClick={this.handleDone}
            >
              {t`Done`}
            </button>
            <button
              className={cx(ButtonsS.Button, CS.ml2)}
              onClick={this.props.onClose}
            >
              {t`Cancel`}
            </button>
          </div>
        </div>
        <div
          className={cx(CS.borderLeft, CS.flex, CS.flexColumn)}
          style={{
            width: 370,
            backgroundColor: color("bg-light"),
            borderColor: color("border"),
          }}
        >
          <QuestionList
            enabledCards={this.state.series}
            onSelect={this.handleQuestionSelectedChange}
            dashcard={this.props.dashcard}
          />
        </div>
      </div>
    );
  }
}
