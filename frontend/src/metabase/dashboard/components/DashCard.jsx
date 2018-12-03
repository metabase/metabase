import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";
import { t } from "c-3po";
import visualizations, { getVisualizationRaw } from "metabase/visualizations";
import Visualization, {
  ERROR_MESSAGE_GENERIC,
  ERROR_MESSAGE_PERMISSION,
} from "metabase/visualizations/components/Visualization.jsx";
import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";

import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";
import ChartSettings from "metabase/visualizations/components/ChartSettings.jsx";

import Icon from "metabase/components/Icon.jsx";

import DashCardParameterMapper from "./DashCardParameterMapper.jsx";

import { IS_EMBED_PREVIEW } from "metabase/lib/embed";

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

export default class DashCard extends Component {
  static propTypes = {
    dashcard: PropTypes.object.isRequired,
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
      ReactDOM.findDOMNode(this).scrollIntoView();
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
      isEditingParameter,
      isFullscreen,
      onAddSeries,
      onRemove,
      navigateToNewCardFromDashboard,
      metadata,
      dashboard,
      parameterValues,
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
        <Visualization
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
          isEditing={isEditing}
          gridSize={
            this.props.isMobile
              ? undefined
              : { width: dashcard.sizeX, height: dashcard.sizeY }
          }
          actionButtons={
            isEditing && !isEditingParameter ? (
              <DashCardActionButtons
                series={series}
                onRemove={onRemove}
                onAddSeries={onAddSeries}
                onReplaceAllVisualizationSettings={
                  this.props.onReplaceAllVisualizationSettings
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
            isEditingParameter && (
              <DashCardParameterMapper dashcard={dashcard} />
            )
          }
          metadata={metadata}
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
        />
      </div>
    );
  }
}

const DashCardActionButtons = ({
  series,
  onRemove,
  onAddSeries,
  onReplaceAllVisualizationSettings,
}) => (
  <span
    className="DashCard-actions flex align-center"
    style={{ lineHeight: 1 }}
  >
    {getVisualizationRaw(series).CardVisualization.supportsSeries && (
      <AddSeriesButton series={series} onAddSeries={onAddSeries} />
    )}
    {onReplaceAllVisualizationSettings &&
      !getVisualizationRaw(series).CardVisualization.disableSettingsConfig && (
        <ChartSettingsButton
          series={series}
          onReplaceAllVisualizationSettings={onReplaceAllVisualizationSettings}
        />
      )}
    <RemoveButton onRemove={onRemove} />
  </span>
);

const ChartSettingsButton = ({ series, onReplaceAllVisualizationSettings }) => (
  <ModalWithTrigger
    wide
    tall
    triggerElement={
      <Icon name="gear" size={HEADER_ICON_SIZE} style={HEADER_ACTION_STYLE} />
    }
    triggerClasses="text-light text-medium-hover cursor-pointer flex align-center flex-no-shrink mr1"
  >
    <ChartSettings
      series={series}
      onChange={onReplaceAllVisualizationSettings}
      isDashboard
    />
  </ModalWithTrigger>
);

const RemoveButton = ({ onRemove }) => (
  <a
    className="text-light text-medium-hover "
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
    className="text-light text-medium-hover cursor-pointer h3 flex-no-shrink relative mr1"
    onClick={onAddSeries}
    style={HEADER_ACTION_STYLE}
  >
    <span className="flex align-center">
      <span className="flex">
        <Icon
          className="absolute"
          name="add"
          style={{ top: 0, left: 0 }}
          size={HEADER_ICON_SIZE / 2}
        />
        <Icon name={getSeriesIconName(series)} size={HEADER_ICON_SIZE} />
      </span>
      <span className="flex-no-shrink text-bold">
        &nbsp;{series.length > 1 ? t`Edit` : t`Add`}
      </span>
    </span>
  </a>
);

function getSeriesIconName(series) {
  try {
    let display = series[0].card.display;
    return visualizations.get(display === "scalar" ? "bar" : display).iconName;
  } catch (e) {
    return "bar";
  }
}
