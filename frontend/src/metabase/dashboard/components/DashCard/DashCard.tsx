import React, { Component, SyntheticEvent } from "react";
import ReactDOM from "react-dom";
import cx from "classnames";
import _ from "underscore";
import { getIn } from "icepick";
import { t } from "ttag";
import { connect } from "react-redux";
import { LocationDescriptor } from "history";

import { IconProps } from "metabase/components/Icon";

import { IS_EMBED_PREVIEW } from "metabase/lib/embed";
import { SERVER_ERROR_TYPES } from "metabase/lib/errors";
import Utils from "metabase/lib/utils";

import { isVirtualDashCard } from "metabase/dashboard/utils";

import { mergeSettings } from "metabase/visualizations/lib/settings";
import Visualization, {
  ERROR_MESSAGE_GENERIC,
  ERROR_MESSAGE_PERMISSION,
} from "metabase/visualizations/components/Visualization";
import WithVizSettingsData from "metabase/visualizations/hoc/WithVizSettingsData";

import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";

import { getParameterValuesBySlug } from "metabase/parameters/utils/parameter-values";

import Mode from "metabase-lib/lib/Mode";
import Metadata from "metabase-lib/lib/metadata/Metadata";

import { VisualizationSettings } from "metabase-types/api/card";
import { CardId, SavedCard } from "metabase-types/types/Card";
import {
  DashboardWithCards,
  DashCard as IDashCard,
  DashCardId,
} from "metabase-types/types/Dashboard";
import { DatasetData } from "metabase-types/types/Dataset";
import {
  ParameterId,
  ParameterValueOrArray,
} from "metabase-types/types/Parameter";
import { Dispatch } from "metabase-types/store";

import DashCardParameterMapper from "../DashCardParameterMapper";
import ClickBehaviorSidebarOverlay from "./ClickBehaviorSidebarOverlay";
import DashCardActionButtons from "./DashCardActionButtons";
import { DashCardRoot, DashboardCardActionsPanel } from "./DashCard.styled";

const DATASET_USUALLY_FAST_THRESHOLD = 15 * 1000;

// This is done to add the `getExtraDataForClick` prop.
// We need that to pass relevant data along with the clicked object.
const WrappedVisualization = WithVizSettingsData(
  connect(null, dispatch => ({ dispatch }))(Visualization),
);

type FetchCardDataOpts = {
  reload?: boolean;
  clear?: boolean;
  ignoreCache?: boolean;
};

type NavigateToNewCardFromDashboardOpts = {
  nextCard: SavedCard;
  previousCard: SavedCard;
  dashcard: IDashCard;
  objectId?: unknown;
};

interface DashCardProps {
  dashboard: DashboardWithCards;
  dashcard: IDashCard & { justAdded?: boolean };
  gridItemWidth: number;
  totalNumGridCols: number;
  dashcardData: Record<DashCardId, Record<CardId, DatasetData>>;
  slowCards: Record<CardId, boolean>;
  parameterValues: Record<ParameterId, ParameterValueOrArray>;
  metadata: Metadata;
  mode?: Mode;

  clickBehaviorSidebarDashcard?: IDashCard | null;

  isEditing?: boolean;
  isEditingParameter?: boolean;
  isFullscreen?: boolean;
  isMobile?: boolean;
  isNightMode?: boolean;

  headerIcon?: IconProps;

  dispatch: Dispatch;
  onAddSeries: () => void;
  onRemove: () => void;
  markNewCardSeen: (dashcardId: DashCardId) => void;
  fetchCardData: (
    card: SavedCard,
    dashCard: IDashCard,
    opts?: FetchCardDataOpts,
  ) => void;
  navigateToNewCardFromDashboard: (
    opts: NavigateToNewCardFromDashboardOpts,
  ) => void;
  onReplaceAllVisualizationSettings: (settings: VisualizationSettings) => void;
  onUpdateVisualizationSettings: (settings: VisualizationSettings) => void;
  showClickBehaviorSidebar: (dashCardId: DashCardId) => void;
  onChangeLocation: (location: LocationDescriptor) => void;
}

function preventDragging(e: SyntheticEvent) {
  e.stopPropagation();
}

class DashCard extends Component<DashCardProps, { isPreviewingCard: boolean }> {
  async componentDidMount() {
    const { dashcard, markNewCardSeen } = this.props;

    // HACK: way to scroll to a newly added card
    if (dashcard.justAdded) {
      const element = ReactDOM.findDOMNode(this);
      if (element && "scrollIntoView" in element) {
        element.scrollIntoView({ block: "nearest" });
      }
      markNewCardSeen(dashcard.id);
    }
  }

  handlePreviewToggle = () => {
    this.setState(prevState => ({
      isPreviewingCard: !prevState.isPreviewingCard,
    }));
  };

  render() {
    const {
      dashcard,
      dashcardData,
      dashboard,
      slowCards,
      metadata,
      parameterValues,
      mode,
      isEditing = false,
      isNightMode = false,
      isFullscreen = false,
      isMobile = false,
      isEditingParameter,
      clickBehaviorSidebarDashcard,
      headerIcon,
      onAddSeries,
      onRemove,
      navigateToNewCardFromDashboard,
    } = this.props;

    const mainCard = {
      ...dashcard.card,
      visualization_settings: mergeSettings(
        dashcard.card.visualization_settings,
        dashcard.visualization_settings,
      ),
    } as SavedCard;

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

    const hideBackground =
      !isEditing &&
      mainCard.visualization_settings["dashcard.background"] === false;

    const isEditingDashboardLayout =
      isEditing && clickBehaviorSidebarDashcard == null && !isEditingParameter;

    const gridSize = { width: dashcard.sizeX, height: dashcard.sizeY };

    return (
      <DashCardRoot
        className="Card rounded flex flex-column hover-parent hover--visibility"
        style={
          hideBackground
            ? { border: 0, background: "transparent", boxShadow: "none" }
            : undefined
        }
        isNightMode={isNightMode}
        isUsuallySlow={isSlow === "usually-slow"}
      >
        {isEditingDashboardLayout ? (
          <DashboardCardActionsPanel onMouseDown={preventDragging}>
            <DashCardActionButtons
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
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          className={cx("flex-full overflow-hidden", {
            "pointer-events-none": isEditingDashboardLayout,
          })}
          classNameWidgets={isEmbed && "text-light text-medium-hover"}
          error={errorMessage}
          headerIcon={headerIcon}
          errorIcon={errorIcon}
          isSlow={isSlow}
          expectedDuration={expectedDuration}
          rawSeries={series}
          showTitle
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
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
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
                <h4 className="text-medium">{t`Text card`}</h4>
              </div>
            ) : isEditingParameter ? (
              <DashCardParameterMapper
                dashcard={dashcard}
                isMobile={isMobile}
              />
            ) : clickBehaviorSidebarDashcard != null ? (
              <ClickBehaviorSidebarOverlay
                dashcard={dashcard}
                dashcardWidth={this.props.gridItemWidth}
                showClickBehaviorSidebar={this.props.showClickBehaviorSidebar}
                isShowingThisClickBehaviorSidebar={
                  clickBehaviorSidebarDashcard?.id === dashcard.id
                }
              />
            ) : null
          }
          metadata={metadata}
          mode={mode}
          onChangeCardAndRun={
            navigateToNewCardFromDashboard
              ? ({
                  nextCard,
                  previousCard,
                  objectId,
                }: Omit<NavigateToNewCardFromDashboardOpts, "dashcard">) => {
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

export default DashCard;
