import React, { Component } from "react";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";
import { t } from "ttag";
import visualizations, { getVisualizationRaw } from "metabase/visualizations";
import Visualization, {
  ERROR_MESSAGE_GENERIC,
  ERROR_MESSAGE_PERMISSION,
} from "metabase/visualizations/components/Visualization";
import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import { ChartSettingsWithState } from "metabase/visualizations/components/ChartSettings";
import WithVizSettingsData from "metabase/visualizations/hoc/WithVizSettingsData";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

import { isVirtualDashCard } from "metabase/dashboard/dashboard";
import DashCardParameterMapper from "./DashCardParameterMapper";

import { IS_EMBED_PREVIEW } from "metabase/lib/embed";
import { getClickBehaviorDescription } from "metabase/lib/click-behavior";

import cx from "classnames";
import _ from "underscore";
import { getIn } from "icepick";
import { getParametersBySlug } from "metabase/meta/Parameter";
import Utils from "metabase/lib/utils";

const DATASET_USUALLY_FAST_THRESHOLD = 15 * 1000;

const HEADER_ICON_SIZE = 16;

const HEADER_ACTION_STYLE = {
  padding: 4,
};

// This is done to add the `getExtraDataForClick` prop.
// We need that to pass relevant data along with the clicked object.
const WrappedVisualization = WithVizSettingsData(
  connect(
    null,
    dispatch => ({ dispatch }),
  )(Visualization),
);

export default class DashCard extends Component {
  static propTypes = {
    dashcard: PropTypes.object.isRequired,
    gridItemWidth: PropTypes.number.isRequired,
    dashcardData: PropTypes.object.isRequired,
    slowCards: PropTypes.object.isRequired,
    parameterValues: PropTypes.object.isRequired,
    markNewCardSeen: PropTypes.func.isRequired,
    fetchCardData: PropTypes.func.isRequired,
    navigateToNewCardFromDashboard: PropTypes.func.isRequired,
  };

  async componentDidMount() {
    const { dashcard, markNewCardSeen } = this.props;

    // HACK: way to scroll to a newly added card
    if (dashcard.justAdded) {
      const element = ReactDOM.findDOMNode(this);
      if (element && element.scrollIntoView) {
        element.scrollIntoView({ block: "nearest" });
      }
      markNewCardSeen(dashcard.id);
    }
  }

  componentWillUnmount() {
    window.clearInterval(this.visibilityTimer);
  }

  render() {
    const {
      dashcard,
      dashcardData,
      slowCards,
      isEditing,
      clickBehaviorSidebarDashcard,
      isEditingParameter,
      isFullscreen,
      onAddSeries,
      onRemove,
      navigateToNewCardFromDashboard,
      metadata,
      dashboard,
      parameterValues,
      mode,
    } = this.props;

    const mainCard = {
      ...dashcard.card,
      visualization_settings: {
        ...dashcard.card.visualization_settings,
        ...dashcard.visualization_settings,
      },
    };
    const cards = [mainCard].concat(dashcard.series || []);
    const dashboardId = dashcard.dashboard_id;
    const isEmbed = Utils.isJWT(dashboardId);
    const series = cards.map(card => ({
      ...getIn(dashcardData, [dashcard.id, card.id]),
      card: card,
      isSlow: slowCards[card.id],
      isUsuallyFast:
        card.query_average_duration &&
        card.query_average_duration < DATASET_USUALLY_FAST_THRESHOLD,
    }));

    const loading = !(series.length > 0 && _.every(series, s => s.data));
    const expectedDuration = Math.max(
      ...series.map(s => s.card.query_average_duration || 0),
    );
    const usuallyFast = _.every(series, s => s.isUsuallyFast);
    const isSlow =
      loading &&
      _.some(series, s => s.isSlow) &&
      (usuallyFast ? "usually-fast" : "usually-slow");
    const errors = series.map(s => s.error).filter(e => e);

    let errorMessage, errorIcon;
    if (_.any(errors, e => e && e.status === 403)) {
      errorMessage = ERROR_MESSAGE_PERMISSION;
      errorIcon = "key";
    } else if (errors.length > 0) {
      if (IS_EMBED_PREVIEW) {
        errorMessage = (errors[0] && errors[0].data) || ERROR_MESSAGE_GENERIC;
      } else {
        errorMessage = ERROR_MESSAGE_GENERIC;
      }
      errorIcon = "warning";
    }

    const params = getParametersBySlug(dashboard.parameters, parameterValues);

    const hideBackground =
      !isEditing &&
      mainCard.visualization_settings["dashcard.background"] === false;

    return (
      <div
        className={cx(
          "Card bordered rounded flex flex-column hover-parent hover--visibility",
          {
            "Card--recent": dashcard.isAdded,
            "Card--slow": isSlow === "usually-slow",
          },
        )}
        style={
          hideBackground
            ? { border: 0, background: "transparent", boxShadow: "none" }
            : null
        }
      >
        <WrappedVisualization
          className="flex-full"
          classNameWidgets={isEmbed && "text-light text-medium-hover"}
          error={errorMessage}
          errorIcon={errorIcon}
          isSlow={isSlow}
          expectedDuration={expectedDuration}
          rawSeries={series}
          showTitle
          isFullscreen={isFullscreen}
          isDashboard
          dispatch={this.props.dispatch}
          dashboard={dashboard}
          parameterValuesBySlug={params}
          isEditing={isEditing}
          gridSize={
            this.props.isMobile
              ? undefined
              : { width: dashcard.sizeX, height: dashcard.sizeY }
          }
          actionButtons={
            isEditing ? (
              <DashCardActionButtons
                series={series}
                hasError={!!errorMessage}
                isVirtualDashCard={isVirtualDashCard(dashcard)}
                onRemove={onRemove}
                onAddSeries={onAddSeries}
                onReplaceAllVisualizationSettings={
                  this.props.onReplaceAllVisualizationSettings
                }
                showClickBehaviorSidebar={() =>
                  this.props.showClickBehaviorSidebar(dashcard.id)
                }
              />
            ) : isEmbed ? (
              <QueryDownloadWidget
                className="m1 text-brand-hover text-light"
                classNameClose="hover-child"
                card={dashcard.card}
                params={params}
                dashcardId={dashcard.id}
                token={dashcard.dashboard_id}
                icon="download"
              />
            ) : (
              undefined
            )
          }
          onUpdateVisualizationSettings={
            this.props.onUpdateVisualizationSettings
          }
          replacementContent={
            (clickBehaviorSidebarDashcard != null || isEditingParameter) &&
            isVirtualDashCard(dashcard) ? (
              <div className="flex full-height align-center justify-center">
                <h4 className="text-medium">{t`Text card`}</h4>
              </div>
            ) : isEditingParameter ? (
              <DashCardParameterMapper dashcard={dashcard} />
            ) : clickBehaviorSidebarDashcard != null ? (
              <ClickBehaviorSidebarOverlay
                dashcard={dashcard}
                dashcardWidth={this.props.gridItemWidth}
                dashboard={dashboard}
                showClickBehaviorSidebar={this.props.showClickBehaviorSidebar}
                isShowingThisClickBehaviorSidebar={
                  clickBehaviorSidebarDashcard.id === dashcard.id
                }
              />
            ) : null
          }
          metadata={metadata}
          mode={mode}
          onChangeCardAndRun={
            navigateToNewCardFromDashboard
              ? ({ nextCard, previousCard }) => {
                  // navigateToNewCardFromDashboard needs `dashcard` for applying active filters to the query
                  navigateToNewCardFromDashboard({
                    nextCard,
                    previousCard,
                    dashcard,
                  });
                }
              : null
          }
          onChangeLocation={this.props.onChangeLocation}
        />
      </div>
    );
  }
}

const DashCardActionButtons = ({
  series,
  isVirtualDashCard,
  hasError,
  onRemove,
  onAddSeries,
  onReplaceAllVisualizationSettings,
  showClickBehaviorSidebar,
}) => {
  const buttons = [];
  if (!hasError) {
    if (
      onReplaceAllVisualizationSettings &&
      !getVisualizationRaw(series).visualization.disableSettingsConfig
    ) {
      buttons.push(
        <ChartSettingsButton
          series={series}
          onReplaceAllVisualizationSettings={onReplaceAllVisualizationSettings}
        />,
      );
    }
    if (!isVirtualDashCard) {
      buttons.push(
        <Tooltip tooltip={t`Click behavior`}>
          <a
            className="text-light text-medium-hover drag-disabled mr1"
            data-metabase-event="Dashboard;Open Click Behavior Sidebar"
            onClick={showClickBehaviorSidebar}
            style={HEADER_ACTION_STYLE}
          >
            <Icon name="click" />
          </a>
        </Tooltip>,
      );
    }

    if (getVisualizationRaw(series).visualization.supportsSeries) {
      buttons.push(
        <AddSeriesButton series={series} onAddSeries={onAddSeries} />,
      );
    }
  }

  return (
    <span
      className="DashCard-actions flex align-center"
      style={{ lineHeight: 1 }}
    >
      {buttons}
      <Tooltip tooltip={t`Remove`}>
        <RemoveButton className="ml1" onRemove={onRemove} />
      </Tooltip>
    </span>
  );
};

const ChartSettingsButton = ({ series, onReplaceAllVisualizationSettings }) => (
  <ModalWithTrigger
    wide
    tall
    triggerElement={
      <Tooltip tooltip={t`Visualization options`}>
        <Icon
          name="palette"
          size={HEADER_ICON_SIZE}
          style={HEADER_ACTION_STYLE}
        />
      </Tooltip>
    }
    triggerClasses="text-light text-medium-hover cursor-pointer flex align-center flex-no-shrink mr1 drag-disabled"
  >
    <ChartSettingsWithState
      className="spread"
      series={series}
      onChange={onReplaceAllVisualizationSettings}
      isDashboard
    />
  </ModalWithTrigger>
);

const RemoveButton = ({ onRemove }) => (
  <a
    className="text-light text-medium-hover drag-disabled"
    data-metabase-event="Dashboard;Remove Card Modal"
    onClick={onRemove}
    style={HEADER_ACTION_STYLE}
  >
    <Icon name="close" size={HEADER_ICON_SIZE} />
  </a>
);

const AddSeriesButton = ({ series, onAddSeries }) => (
  <a
    data-metabase-event={"Dashboard;Edit Series Modal;open"}
    className="text-light text-medium-hover cursor-pointer h3 flex-no-shrink relative mr1 drag-disabled"
    onClick={onAddSeries}
    style={HEADER_ACTION_STYLE}
  >
    <Tooltip tooltip={series.length > 1 ? t`Edit series` : t`Add series`}>
      <span className="flex align-center">
        <span className="flex">
          <Icon
            className="absolute"
            name="add"
            style={{ top: 0, left: 1 }}
            size={HEADER_ICON_SIZE / 2}
          />
          <Icon name={getSeriesIconName(series)} size={HEADER_ICON_SIZE - 2} />
        </span>
      </span>
    </Tooltip>
  </a>
);

function getSeriesIconName(series) {
  try {
    const display = series[0].card.display;
    return visualizations.get(display === "scalar" ? "bar" : display).iconName;
  } catch (e) {
    return "bar";
  }
}

const MIN_WIDTH_FOR_ON_CLICK_LABEL = 330;

const ClickBehaviorSidebarOverlay = ({
  dashcard,
  dashcardWidth,
  dashboard,
  showClickBehaviorSidebar,
  isShowingThisClickBehaviorSidebar,
}) => {
  return (
    <div className="flex align-center justify-center full-height">
      <div
        className={cx("text-bold flex py1 px2 mb2 rounded cursor-pointer", {
          "bg-brand text-white": isShowingThisClickBehaviorSidebar,
          "bg-light text-medium": !isShowingThisClickBehaviorSidebar,
        })}
        onClick={() =>
          showClickBehaviorSidebar(
            isShowingThisClickBehaviorSidebar ? null : dashcard.id,
          )
        }
      >
        <Icon
          name="click"
          className={cx("mr1", {
            "text-light": !isShowingThisClickBehaviorSidebar,
          })}
        />
        {dashcardWidth > MIN_WIDTH_FOR_ON_CLICK_LABEL && (
          <div className="mr2">{t`On click`}</div>
        )}
        <div
          className={cx({ "text-brand": !isShowingThisClickBehaviorSidebar })}
        >
          {getClickBehaviorDescription(dashcard)}
        </div>
      </div>
    </div>
  );
};
