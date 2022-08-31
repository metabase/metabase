/* eslint-disable react/prop-types */
import React, { Component } from "react";
import styled from "@emotion/styled";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";
import { t } from "ttag";
import visualizations, { getVisualizationRaw } from "metabase/visualizations";
import { mergeSettings } from "metabase/visualizations/lib/settings";
import Visualization, {
  ERROR_MESSAGE_GENERIC,
  ERROR_MESSAGE_PERMISSION,
} from "metabase/visualizations/components/Visualization";
import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";
import { SERVER_ERROR_TYPES } from "metabase/lib/errors";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import { ChartSettingsWithState } from "metabase/visualizations/components/ChartSettings";
import WithVizSettingsData from "metabase/visualizations/hoc/WithVizSettingsData";

import Icon, { iconPropTypes } from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

import { isVirtualDashCard } from "metabase/dashboard/utils";
import DashCardParameterMapper from "./DashCardParameterMapper";

import { IS_EMBED_PREVIEW } from "metabase/lib/embed";
import { getClickBehaviorDescription } from "metabase/lib/click-behavior";

import { isActionButtonCard } from "metabase/writeback/utils";

import cx from "classnames";
import _ from "underscore";
import { getIn } from "icepick";
import { getParameterValuesBySlug } from "metabase/parameters/utils/parameter-values";
import Utils from "metabase/lib/utils";
import { DashCardRoot } from "./DashCard.styled";

const DATASET_USUALLY_FAST_THRESHOLD = 15 * 1000;

const HEADER_ICON_SIZE = 16;

const HEADER_ACTION_STYLE = {
  padding: 4,
};

// This is done to add the `getExtraDataForClick` prop.
// We need that to pass relevant data along with the clicked object.
const WrappedVisualization = WithVizSettingsData(
  connect(null, dispatch => ({ dispatch }))(Visualization),
);

export default class DashCard extends Component {
  static propTypes = {
    dashcard: PropTypes.object.isRequired,
    gridItemWidth: PropTypes.number.isRequired,
    totalNumGridCols: PropTypes.number.isRequired,
    dashcardData: PropTypes.object.isRequired,
    slowCards: PropTypes.object.isRequired,
    parameterValues: PropTypes.object.isRequired,
    markNewCardSeen: PropTypes.func.isRequired,
    fetchCardData: PropTypes.func.isRequired,
    navigateToNewCardFromDashboard: PropTypes.func.isRequired,
    headerIcon: PropTypes.shape(iconPropTypes),
    isNightMode: PropTypes.bool,
  };

  constructor(props) {
    super(props);

    this.state = {
      isPreviewingCard: false,
    };
  }

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

  handlePreviewToggle = () => {
    this.setState(prevState => ({
      isPreviewingCard: !prevState.isPreviewingCard,
    }));
  };

  preventDragging = e => {
    e.stopPropagation();
  };

  render() {
    const {
      dashcard,
      dashcardData,
      slowCards,
      isEditing,
      clickBehaviorSidebarDashcard,
      isEditingParameter,
      isFullscreen,
      isMobile,
      onAddSeries,
      onRemove,
      navigateToNewCardFromDashboard,
      metadata,
      dashboard,
      parameterValues,
      mode,
      headerIcon,
      isNightMode,
    } = this.props;

    const mainCard = {
      ...dashcard.card,
      visualization_settings: mergeSettings(
        dashcard.card.visualization_settings,
        dashcard.visualization_settings,
      ),
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

    const loading =
      !(series.length > 0 && _.every(series, s => s.data)) &&
      !isVirtualDashCard(dashcard);

    const expectedDuration = Math.max(
      ...series.map(s => s.card.query_average_duration || 0),
    );
    const usuallyFast = _.every(series, s => s.isUsuallyFast);
    const isSlow =
      loading &&
      _.some(series, s => s.isSlow) &&
      (usuallyFast ? "usually-fast" : "usually-slow");

    const isAccessRestricted = series.some(
      s =>
        s.error_type === SERVER_ERROR_TYPES.missingPermissions ||
        s.error?.status === 403,
    );

    const errors = series.map(s => s.error).filter(e => e);

    let errorMessage, errorIcon;
    if (isAccessRestricted) {
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

    const parameterValuesBySlug = getParameterValuesBySlug(
      dashboard.parameters,
      parameterValues,
    );

    const isActionButton = isActionButtonCard(mainCard);

    const hideBackground =
      !isEditing &&
      (mainCard.visualization_settings["dashcard.background"] === false ||
        mainCard.display === "list" ||
        isActionButton);

    const isEditingDashboardLayout =
      isEditing && clickBehaviorSidebarDashcard == null && !isEditingParameter;

    const gridSize = { width: dashcard.sizeX, height: dashcard.sizeY };

    return (
      <DashCardRoot
        className="Card rounded flex flex-column hover-parent hover--visibility"
        style={
          hideBackground
            ? { border: 0, background: "transparent", boxShadow: "none" }
            : null
        }
        isNightMode={isNightMode}
        isUsuallySlow={isSlow === "usually-slow"}
      >
        {isEditingDashboardLayout ? (
          <DashboardCardActionsPanel onMouseDown={this.preventDragging}>
            <DashCardActionButtons
              card={mainCard}
              series={series}
              isLoading={loading}
              isVirtualDashCard={isVirtualDashCard(dashcard)}
              hasError={!!errorMessage}
              onRemove={onRemove}
              onAddSeries={onAddSeries}
              onReplaceAllVisualizationSettings={
                this.props.onReplaceAllVisualizationSettings
              }
              showClickBehaviorSidebar={() =>
                this.props.showClickBehaviorSidebar(dashcard.id)
              }
              isPreviewing={this.state.isPreviewingCard}
              onPreviewToggle={this.handlePreviewToggle}
              dashboard={dashboard}
            />
          </DashboardCardActionsPanel>
        ) : null}
        <WrappedVisualization
          className={cx("flex-full overflow-hidden", {
            "pointer-events-none": isEditingDashboardLayout,
          })}
          classNameWidgets={isEmbed && "text-light text-medium-hover"}
          error={errorMessage}
          headerIcon={headerIcon}
          errorIcon={errorIcon}
          isSlow={isSlow}
          isDataApp={dashboard.is_app_page}
          expectedDuration={expectedDuration}
          rawSeries={series}
          showTitle={!dashboard.is_app_page}
          isFullscreen={isFullscreen}
          isNightMode={isNightMode}
          isDashboard
          dispatch={this.props.dispatch}
          dashboard={dashboard}
          dashcard={dashcard}
          parameterValues={parameterValues}
          parameterValuesBySlug={parameterValuesBySlug}
          isEditing={isEditing}
          isPreviewing={this.state.isPreviewingCard}
          isEditingParameter={isEditingParameter}
          isMobile={isMobile}
          gridSize={gridSize}
          totalNumGridCols={this.props.totalNumGridCols}
          actionButtons={
            isEmbed ? (
              <QueryDownloadWidget
                className="m1 text-brand-hover text-light"
                classNameClose="hover-child"
                card={dashcard.card}
                params={parameterValuesBySlug}
                dashcardId={dashcard.id}
                token={dashcard.dashboard_id}
                icon="download"
              />
            ) : null
          }
          onUpdateVisualizationSettings={
            this.props.onUpdateVisualizationSettings
          }
          replacementContent={
            clickBehaviorSidebarDashcard != null &&
            isVirtualDashCard(dashcard) ? (
              <div className="flex full-height align-center justify-center">
                <h4 className="text-medium">
                  {dashcard.visualization_settings.virtual_card.display ===
                  "text"
                    ? t`Text card`
                    : t`Action button`}
                </h4>
              </div>
            ) : isEditingParameter && !isActionButton ? (
              <DashCardParameterMapper
                dashcard={dashcard}
                isMobile={isMobile}
              />
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
              ? ({ nextCard, previousCard, objectId }) => {
                  // navigateToNewCardFromDashboard needs `dashcard` for applying active filters to the query
                  navigateToNewCardFromDashboard({
                    nextCard,
                    previousCard,
                    dashcard,
                    objectId,
                  });
                }
              : null
          }
          onChangeLocation={this.props.onChangeLocation}
        />
      </DashCardRoot>
    );
  }
}

const DashboardCardActionsPanel = styled.div`
  padding: 0.125em 0.25em;
  position: absolute;
  background: white;
  transform: translateY(-50%);
  top: 0;
  right: 20px;
  border-radius: 8px;
  box-shadow: 0px 1px 3px rgb(0 0 0 / 13%);
  z-index: 3;
  cursor: default;
  transition: opacity 200ms;
  opacity: 0;
  pointer-events: none;

  .Card:hover & {
    opacity: 1;
    pointer-events: all;
  }

  .Dash--dragging & {
    display: none;
  }
`;

const DashCardActionButtons = ({
  card,
  series,
  isLoading,
  isVirtualDashCard,
  hasError,
  onRemove,
  onAddSeries,
  onReplaceAllVisualizationSettings,
  showClickBehaviorSidebar,
  onPreviewToggle,
  isPreviewing,
  dashboard,
}) => {
  const buttons = [];

  if (getVisualizationRaw(series).visualization.supportPreviewing) {
    buttons.push(
      <ToggleCardPreviewButton
        key="toggle-card-preview-button"
        isPreviewing={isPreviewing}
        onPreviewToggle={onPreviewToggle}
      />,
    );
  }

  if (!isLoading && !hasError) {
    if (
      onReplaceAllVisualizationSettings &&
      !getVisualizationRaw(series).visualization.disableSettingsConfig
    ) {
      buttons.push(
        <ChartSettingsButton
          key="chart-settings-button"
          series={series}
          onReplaceAllVisualizationSettings={onReplaceAllVisualizationSettings}
          dashboard={dashboard}
        />,
      );
    }
    if (!isVirtualDashCard || isActionButtonCard(card)) {
      buttons.push(
        <Tooltip key="click-behavior-tooltip" tooltip={t`Click behavior`}>
          <a
            className="text-dark-hover drag-disabled mr1"
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
        <AddSeriesButton
          key="add-series-button"
          series={series}
          onAddSeries={onAddSeries}
        />,
      );
    }
  }

  return (
    <span className="flex align-center text-medium" style={{ lineHeight: 1 }}>
      {buttons}
      <Tooltip tooltip={t`Remove`}>
        <RemoveButton className="ml1" onRemove={onRemove} />
      </Tooltip>
    </span>
  );
};

const ChartSettingsButton = ({
  series,
  onReplaceAllVisualizationSettings,
  dashboard,
}) => (
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
    triggerClasses="text-dark-hover cursor-pointer flex align-center flex-no-shrink mr1 drag-disabled"
    enableMouseEvents
  >
    <ChartSettingsWithState
      className="spread"
      series={series}
      onChange={onReplaceAllVisualizationSettings}
      isDashboard
      dashboard={dashboard}
    />
  </ModalWithTrigger>
);

const RemoveButton = ({ onRemove }) => (
  <a
    className="text-dark-hover drag-disabled"
    data-metabase-event="Dashboard;Remove Card Modal"
    onClick={onRemove}
    style={HEADER_ACTION_STYLE}
  >
    <Icon name="close" size={HEADER_ICON_SIZE} />
  </a>
);

const AddSeriesButton = ({ series, onAddSeries }) => (
  <a
    data-testid="add-series-button"
    data-metabase-event="Dashboard;Edit Series Modal;open"
    className="text-dark-hover cursor-pointer h3 flex-no-shrink relative mr1 drag-disabled"
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

const ToggleCardPreviewButton = ({ isPreviewing, onPreviewToggle }) => {
  return (
    <a
      data-metabase-event="Dashboard;Text;edit"
      className="text-dark-hover cursor-pointer h3 flex-no-shrink relative mr1 drag-disabled"
      onClick={onPreviewToggle}
      style={HEADER_ACTION_STYLE}
    >
      <Tooltip tooltip={isPreviewing ? t`Edit` : t`Preview`}>
        <span className="flex align-center">
          <span className="flex" style={{ width: 18 }}>
            {isPreviewing ? (
              <Icon name="edit_document" size={HEADER_ICON_SIZE} />
            ) : (
              <Icon name="eye" size={18} />
            )}
          </span>
        </span>
      </Tooltip>
    </a>
  );
};

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
