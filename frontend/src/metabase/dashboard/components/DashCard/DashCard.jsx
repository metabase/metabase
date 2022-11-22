/* eslint-disable react/prop-types */
import React, { Component } from "react";
import ReactDOM from "react-dom";
import PropTypes from "prop-types";
import cx from "classnames";
import { t } from "ttag";
import { connect } from "react-redux";
import { getIn } from "icepick";

import { iconPropTypes } from "metabase/components/Icon";

import { IS_EMBED_PREVIEW } from "metabase/lib/embed";
import { SERVER_ERROR_TYPES } from "metabase/lib/errors";
import Utils from "metabase/lib/utils";

import Visualization, {
  ERROR_MESSAGE_GENERIC,
  ERROR_MESSAGE_PERMISSION,
} from "metabase/visualizations/components/Visualization";
import WithVizSettingsData from "metabase/visualizations/hoc/WithVizSettingsData";
import { mergeSettings } from "metabase/visualizations/lib/settings";

import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";

import { isVirtualDashCard } from "metabase/dashboard/utils";

import { isActionCard } from "metabase/writeback/utils";

import { getParameterValuesBySlug } from "metabase-lib/parameters/utils/parameter-values";

import ClickBehaviorSidebarOverlay from "./ClickBehaviorSidebarOverlay";
import DashCardActionButtons from "./DashCardActionButtons";
import DashCardParameterMapper from "./DashCardParameterMapper";
import { DashCardRoot, DashboardCardActionsPanel } from "./DashCard.styled";

const DATASET_USUALLY_FAST_THRESHOLD = 15 * 1000;

// This is done to add the `getExtraDataForClick` prop.
// We need that to pass relevant data along with the clicked object.
const WrappedVisualization = WithVizSettingsData(
  connect(null, dispatch => ({ dispatch }))(Visualization),
);

function preventDragging(event) {
  event.stopPropagation();
}

function getSeriesError(series) {
  const isAccessRestricted = series.some(
    s =>
      s.error_type === SERVER_ERROR_TYPES.missingPermissions ||
      s.error?.status === 403,
  );

  if (isAccessRestricted) {
    return {
      message: ERROR_MESSAGE_PERMISSION,
      icon: "key",
    };
  }

  const errors = series.map(s => s.error).filter(Boolean);
  if (errors.length > 0) {
    if (IS_EMBED_PREVIEW) {
      const message = errors[0]?.data || ERROR_MESSAGE_GENERIC;
      return { message, icon: "warning" };
    }
    return {
      message: ERROR_MESSAGE_GENERIC,
      icon: "warning",
    };
  }

  return;
}

const propTypes = {
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

class DashCard extends Component {
  state = {
    isPreviewingCard: false,
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

  handlePreviewToggle = () => {
    this.setState(prevState => ({
      isPreviewingCard: !prevState.isPreviewingCard,
    }));
  };

  handleShowClickBehaviorSidebar = () => {
    const { dashcard, showClickBehaviorSidebar } = this.props;
    showClickBehaviorSidebar(dashcard.id);
  };

  handleCardChangeAndRun = ({ nextCard, previousCard, objectId }) => {
    const { dashcard, navigateToNewCardFromDashboard } = this.props;
    navigateToNewCardFromDashboard({
      nextCard,
      previousCard,
      dashcard,
      objectId,
    });
  };

  getMainCard = () => {
    const { dashcard } = this.props;
    return {
      ...dashcard.card,
      visualization_settings: mergeSettings(
        dashcard.card.visualization_settings,
        dashcard.visualization_settings,
      ),
    };
  };

  getSeries = mainCard => {
    const { dashcard, dashcardData, slowCards } = this.props;
    const cards = [mainCard].concat(dashcard.series || []);
    return cards.map(card => ({
      ...getIn(dashcardData, [dashcard.id, card.id]),
      card: card,
      isSlow: slowCards[card.id],
      isUsuallyFast:
        card.query_average_duration &&
        card.query_average_duration < DATASET_USUALLY_FAST_THRESHOLD,
    }));
  };

  getIsLoading = series => {
    const { dashcard } = this.props;
    if (isVirtualDashCard(dashcard)) {
      return false;
    }
    const hasSeries = series.length > 0 && series.every(s => s.data);
    return !hasSeries;
  };

  getQueryStats = ({ series, isLoading }) => {
    const expectedDuration = Math.max(
      ...series.map(s => s.card.query_average_duration || 0),
    );
    const isUsuallyFast = series.every(s => s.isUsuallyFast);
    let isSlow = false;
    if (isLoading && series.some(s => s.isSlow)) {
      isSlow = isUsuallyFast ? "usually-fast" : "usually-slow";
    }
    return { expectedDuration, isSlow };
  };

  getHasHiddenBackground = ({ mainCard, isAction }) => {
    const { isEditing } = this.props;

    if (isEditing) {
      return false;
    }

    return (
      mainCard.visualization_settings["dashcard.background"] === false ||
      mainCard.display === "list" ||
      isAction
    );
  };

  renderVisualizationOverlay = ({ isAction }) => {
    const {
      dashcard,
      dashboard,
      clickBehaviorSidebarDashcard,
      gridItemWidth,
      isMobile,
      isEditingParameter,
      showClickBehaviorSidebar,
    } = this.props;

    const isClickBehaviorSidebarOpen = !!clickBehaviorSidebarDashcard;
    const isEditingDashCardClickBehavior =
      clickBehaviorSidebarDashcard?.id === dashcard.id;

    if (isClickBehaviorSidebarOpen) {
      if (isVirtualDashCard(dashcard)) {
        return (
          <div className="flex full-height align-center justify-center">
            <h4 className="text-medium">
              {dashcard.visualization_settings.virtual_card.display === "text"
                ? t`Text card`
                : t`Action button`}
            </h4>
          </div>
        );
      }
      return (
        <ClickBehaviorSidebarOverlay
          dashcard={dashcard}
          dashcardWidth={gridItemWidth}
          dashboard={dashboard}
          showClickBehaviorSidebar={showClickBehaviorSidebar}
          isShowingThisClickBehaviorSidebar={isEditingDashCardClickBehavior}
        />
      );
    }

    if (isEditingParameter && !isAction) {
      return (
        <DashCardParameterMapper dashcard={dashcard} isMobile={isMobile} />
      );
    }

    return null;
  };

  renderDashCardActions = ({
    mainCard,
    series,
    loading,
    errorMessage,
    isEditingDashboardLayout,
  }) => {
    const {
      dashcard,
      dashboard,
      onAddSeries,
      onRemove,
      onReplaceAllVisualizationSettings,
    } = this.props;
    const { isPreviewingCard } = this.state;

    if (isEditingDashboardLayout) {
      return (
        <DashboardCardActionsPanel onMouseDown={preventDragging}>
          <DashCardActionButtons
            card={mainCard}
            series={series}
            dashboard={dashboard}
            isLoading={loading}
            isPreviewing={isPreviewingCard}
            isVirtualDashCard={isVirtualDashCard(dashcard)}
            hasError={!!errorMessage}
            onAddSeries={onAddSeries}
            onRemove={onRemove}
            onReplaceAllVisualizationSettings={
              onReplaceAllVisualizationSettings
            }
            showClickBehaviorSidebar={this.handleShowClickBehaviorSidebar}
            onPreviewToggle={this.handlePreviewToggle}
          />
        </DashboardCardActionsPanel>
      );
    }

    return null;
  };

  renderActionButtons = ({ parameterValuesBySlug, isEmbed }) => {
    const { dashcard } = this.props;
    if (isEmbed) {
      return (
        <QueryDownloadWidget
          className="m1 text-brand-hover text-light"
          classNameClose="hover-child"
          card={dashcard.card}
          params={parameterValuesBySlug}
          dashcardId={dashcard.id}
          token={dashcard.dashboard_id}
          icon="download"
        />
      );
    }
    return null;
  };

  render() {
    const {
      dashcard,
      metadata,
      dashboard,
      clickBehaviorSidebarDashcard,
      parameterValues,
      mode,
      headerIcon,
      totalNumGridCols,
      isEditing,
      isNightMode,
      isFullscreen,
      isMobile,
      isEditingParameter,
      navigateToNewCardFromDashboard,
      onUpdateVisualizationSettings,
      onChangeLocation,
      dispatch,
    } = this.props;
    const { isPreviewingCard } = this.state;

    const mainCard = this.getMainCard();
    const isAction = isActionCard(mainCard);
    const isEmbed = Utils.isJWT(dashcard.dashboard_id);

    const series = this.getSeries(mainCard);

    const isLoading = this.getIsLoading(series);
    const error = getSeriesError(series);
    const { expectedDuration, isSlow } = this.getQueryStats({
      series,
      isLoading,
    });

    const parameterValuesBySlug = getParameterValuesBySlug(
      dashboard.parameters,
      parameterValues,
    );

    const hasHiddenBackground = this.getHasHiddenBackground({
      mainCard,
      isAction,
    });

    const isEditingDashboardLayout =
      isEditing && !clickBehaviorSidebarDashcard && !isEditingParameter;

    const gridSize = { width: dashcard.size_x, height: dashcard.size_y };

    const onChangeCardAndRun = navigateToNewCardFromDashboard
      ? this.handleCardChangeAndRun
      : null;

    return (
      <DashCardRoot
        className="Card rounded flex flex-column hover-parent hover--visibility"
        hasHiddenBackground={hasHiddenBackground}
        isNightMode={isNightMode}
        isUsuallySlow={isSlow === "usually-slow"}
      >
        {this.renderDashCardActions({
          mainCard,
          series,
          loading: isLoading,
          errorMessage: error?.message,
          isEditingDashboardLayout,
        })}
        <WrappedVisualization
          className={cx("flex-full overflow-hidden", {
            "pointer-events-none": isEditingDashboardLayout,
          })}
          classNameWidgets={cx({
            "text-light text-medium-hover": isEmbed,
          })}
          dashboard={dashboard}
          dashcard={dashcard}
          parameterValues={parameterValues}
          parameterValuesBySlug={parameterValuesBySlug}
          rawSeries={series}
          headerIcon={headerIcon}
          error={error?.message}
          errorIcon={error?.icon}
          gridSize={gridSize}
          metadata={metadata}
          mode={mode}
          totalNumGridCols={totalNumGridCols}
          isSlow={isSlow}
          isDataApp={false}
          expectedDuration={expectedDuration}
          showTitle
          isFullscreen={isFullscreen}
          isNightMode={isNightMode}
          isDashboard
          isEditing={isEditing}
          isPreviewing={isPreviewingCard}
          isEditingParameter={isEditingParameter}
          isMobile={isMobile}
          actionButtons={this.renderActionButtons({
            parameterValuesBySlug,
            isEmbed,
          })}
          onUpdateVisualizationSettings={onUpdateVisualizationSettings}
          replacementContent={this.renderVisualizationOverlay({ isAction })}
          onChangeCardAndRun={onChangeCardAndRun}
          onChangeLocation={onChangeLocation}
          dispatch={dispatch}
        />
      </DashCardRoot>
    );
  }
}

DashCard.propTypes = propTypes;

export default DashCard;
