import { getIn } from "icepick";
import { Component } from "react";
import { t } from "ttag";

import type {
  Card,
  DashCardDataMap,
  DashCardId,
  DashboardCard,
} from "metabase-types/api";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { color } from "metabase/lib/colors";
import Visualization from "metabase/visualizations/components/Visualization";

import { QuestionList } from "./QuestionList";

/**
 * The first series is the base dashcard.card.
 * It does not make sense to remove it in this modal as it
 * represents the dashboard card the modal was opened for.
 */
const CAN_REMOVE_SERIES = (seriesIndex: number) => seriesIndex > 0;

export interface Props {
  dashcard: DashboardCard;
  dashcardData: DashCardDataMap;
  fetchCardData: (
    card: Card,
    dashcard: DashboardCard,
    options: {
      clearCache?: boolean;
      ignoreCache?: boolean;
      reload?: boolean;
    },
  ) => Promise<unknown>;
  setDashCardAttributes: (options: {
    id: DashCardId;
    attributes: Partial<DashboardCard>;
  }) => void;
  onClose: () => void;
}

interface State {
  error: unknown;
  isLoading: boolean;
  series: NonNullable<DashboardCard["series"]>;
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
      <div className="spread flex">
        <div className="flex flex-column flex-full">
          <div className="flex-no-shrink h3 pl4 pt4 pb2 text-bold">
            Edit data
          </div>
          <div className="flex-full ml2 mr1 relative">
            <Visualization
              canRemoveSeries={CAN_REMOVE_SERIES}
              className="spread"
              errorMessageOverride={
                series.length > 1
                  ? t`Unable to combine these questions`
                  : undefined
              }
              rawSeries={series}
              showTitle
              isDashboard
              isMultiseries
              onRemoveSeries={this.handleRemoveSeries}
            />
            {this.state.isLoading && (
              <div
                className="spred flex layout-centered"
                style={{ backgroundColor: color("bg-white") }}
              >
                <div className="h3 rounded bordered p3 bg-white shadowed">
                  {t`Applying Question`}
                </div>
              </div>
            )}
          </div>
          <div className="flex-no-shrink pl4 pb4 pt1">
            <button
              className="Button Button--primary"
              onClick={this.handleDone}
            >
              {t`Done`}
            </button>
            <button
              data-metabase-event="Dashboard;Edit Series Modal;cancel"
              className="Button ml2"
              onClick={this.props.onClose}
            >
              {t`Cancel`}
            </button>
          </div>
        </div>
        <div
          className="border-left flex flex-column"
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
