import type { MouseEvent, ReactNode } from "react";
import { Component, Fragment } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";
import type { Location, LocationDescriptor } from "history";

import { trackExportDashboardToPDF } from "metabase/dashboard/analytics";

import { getIsNavbarOpen } from "metabase/selectors/app";

import ActionButton from "metabase/components/ActionButton";
import { LeaveConfirmationModalContent } from "metabase/components/LeaveConfirmationModal";
import Modal from "metabase/components/Modal";
import Button from "metabase/core/components/Button";
import { Icon, Menu, Tooltip } from "metabase/ui";
import EntityMenu from "metabase/components/EntityMenu";

import Bookmark from "metabase/entities/bookmarks";

import { getDashboardActions } from "metabase/dashboard/components/DashboardActions";

import { TextOptionsButton } from "metabase/dashboard/components/TextOptions/TextOptionsButton";
import { ParametersPopover } from "metabase/dashboard/components/ParametersPopover";
import { DashboardBookmark } from "metabase/dashboard/components/DashboardBookmark";
import TippyPopover from "metabase/components/Popover/TippyPopover";

import { getPulseFormInput } from "metabase/pulse/selectors";
import { fetchPulseFormInput } from "metabase/pulse/actions";
import {
  getIsBookmarked,
  getIsShowDashboardInfoSidebar,
  getMissingRequiredParameters,
} from "metabase/dashboard/selectors";
import type {
  AddSectionOpts,
  NewDashCardOpts,
} from "metabase/dashboard/actions";
import {
  addActionToDashboard,
  addSectionToDashboard,
  toggleSidebar,
} from "metabase/dashboard/actions";

import type { SectionLayout } from "metabase/dashboard/sections";
import { layoutOptions } from "metabase/dashboard/sections";
import { hasDatabaseActionsEnabled } from "metabase/dashboard/utils";
import { saveDashboardPdf } from "metabase/visualizations/lib/save-dashboard-pdf";
import { getSetting } from "metabase/selectors/settings";
import { dismissAllUndo } from "metabase/redux/undo";

import Link from "metabase/core/components/Link/Link";
import Collections from "metabase/entities/collections/collections";
import { isInstanceAnalyticsCollection } from "metabase/collections/utils";

import type {
  Bookmark as IBookmark,
  DashboardId,
  DashboardTabId,
  Dashboard,
  ActionDisplayType,
  WritebackAction,
  Collection,
  DatabaseId,
  Database,
  CardId,
  ParameterMappingOptions,
} from "metabase-types/api";
import type {
  DashboardSidebarName,
  DashboardSidebarState,
  State,
} from "metabase-types/store";

import { PLUGIN_DASHBOARD_HEADER } from "metabase/plugins";
import type { UiParameter } from "metabase-lib/parameters/types";
import { ExtraEditButtonsMenu } from "../ExtraEditButtonsMenu/ExtraEditButtonsMenu";
import { SIDEBAR_NAME } from "../../constants";
import { DashboardHeaderComponent } from "./DashboardHeaderView";
import { SectionLayoutPreview } from "./SectionLayoutPreview";
import {
  DashboardHeaderButton,
  DashboardHeaderActionDivider,
} from "./DashboardHeader.styled";

interface OwnProps {
  dashboardId: DashboardId;
  dashboard: Dashboard;
  dashboardBeforeEditing?: Dashboard | null;
  bookmarks: IBookmark[];
  databases: Record<DatabaseId, Database>;
  collection: Collection;
  sidebar: DashboardSidebarState;
  location: Location;
  refreshPeriod: number | null;
  isAdmin: boolean;
  isDirty: boolean;
  isEditing: boolean;
  isFullscreen: boolean;
  isNightMode: boolean;
  isAdditionalInfoVisible: boolean;
  isAddParameterPopoverOpen: boolean;
  canManageSubscriptions: boolean;
  hasNightModeToggle: boolean;
  parametersWidget: ReactNode;

  addCardToDashboard: (opts: {
    dashId: DashboardId;
    cardId: CardId;
    tabId: DashboardTabId | null;
  }) => void;
  addHeadingDashCardToDashboard: (opts: NewDashCardOpts) => void;
  addMarkdownDashCardToDashboard: (opts: NewDashCardOpts) => void;
  addLinkDashCardToDashboard: (opts: NewDashCardOpts) => void;
  addSectionToDashboard: (opts: AddSectionOpts) => void;

  fetchDashboard: (opts: {
    dashId: DashboardId;
    queryParams?: Record<string, unknown>;
    options?: {
      clearCache?: boolean;
      preserveParameters?: boolean;
    };
  }) => Promise<void>;
  setDashboardAttribute: <Key extends keyof Dashboard>(
    key: Key,
    value: Dashboard[Key],
  ) => void;
  setRefreshElapsedHook: (hook: (elapsed: number) => void) => void;
  updateDashboardAndCards: () => void;

  addParameter: (option: ParameterMappingOptions) => void;
  showAddParameterPopover: () => void;
  hideAddParameterPopover: () => void;

  onEditingChange: (arg: Dashboard | boolean) => void;
  onRefreshPeriodChange: (period: number | null) => void;
  onFullscreenChange: (
    isFullscreen: boolean,
    browserFullscreen?: boolean,
  ) => void;
  onSharingClick: () => void;
  onNightModeChange: () => void;

  setSidebar: (opts: { name: DashboardSidebarName }) => void;
  closeSidebar: () => void;
}

interface StateProps {
  formInput: unknown;
  selectedTabId: DashboardTabId | null;
  isBookmarked: boolean;
  isNavBarOpen: boolean;
  isShowingDashboardInfoSidebar: boolean;
  isHomepageDashboard: boolean;
  missingRequiredParameters: UiParameter[];
}

interface DispatchProps {
  createBookmark: (args: { id: DashboardId }) => void;
  deleteBookmark: (args: { id: DashboardId }) => void;
  fetchPulseFormInput: () => void;
  toggleSidebar: (sidebarName: DashboardSidebarName) => void;
  onChangeLocation: (location: LocationDescriptor) => void;
  addActionToDashboard: (
    opts: NewDashCardOpts & {
      action: Partial<WritebackAction>;
      displayType: ActionDisplayType;
    },
  ) => void;
  dismissAllUndo: () => void;
}

type DashboardHeaderProps = OwnProps & StateProps & DispatchProps;

const mapStateToProps = (state: State, props: OwnProps): StateProps => {
  return {
    formInput: getPulseFormInput(state),
    isBookmarked: getIsBookmarked(state, props),
    isNavBarOpen: getIsNavbarOpen(state),
    isShowingDashboardInfoSidebar: getIsShowDashboardInfoSidebar(state),
    selectedTabId: state.dashboard.selectedTabId,
    isHomepageDashboard:
      getSetting(state, "custom-homepage") &&
      getSetting(state, "custom-homepage-dashboard") === props.dashboard?.id,
    missingRequiredParameters: getMissingRequiredParameters(state),
  };
};

const mapDispatchToProps = {
  createBookmark: ({ id }: { id: DashboardId }) =>
    Bookmark.actions.create({ id, type: "dashboard" }),
  deleteBookmark: ({ id }: { id: DashboardId }) =>
    Bookmark.actions.delete({ id, type: "dashboard" }),
  fetchPulseFormInput,
  onChangeLocation: push,
  toggleSidebar,
  addActionToDashboard,
  addSectionToDashboard,
  dismissAllUndo,
};

class DashboardHeaderContainer extends Component<DashboardHeaderProps> {
  state = {
    showCancelWarning: false,
  };

  componentDidMount() {
    this.props.fetchPulseFormInput();
  }

  handleEdit(dashboard: Dashboard) {
    this.props.onEditingChange(dashboard);
  }

  handleCancelWarningClose = () => {
    this.setState({ showCancelWarning: false });
  };

  onAddMarkdownBox() {
    this.props.addMarkdownDashCardToDashboard({
      dashId: this.props.dashboard.id,
      tabId: this.props.selectedTabId,
    });
  }

  onAddHeading() {
    this.props.addHeadingDashCardToDashboard({
      dashId: this.props.dashboard.id,
      tabId: this.props.selectedTabId,
    });
  }

  onAddLinkCard() {
    this.props.addLinkDashCardToDashboard({
      dashId: this.props.dashboard.id,
      tabId: this.props.selectedTabId,
    });
  }

  onAddSection(sectionLayout: SectionLayout) {
    this.props.addSectionToDashboard({
      dashId: this.props.dashboard.id,
      tabId: this.props.selectedTabId,
      sectionLayout,
    });
  }

  onAddAction() {
    this.props.addActionToDashboard({
      dashId: this.props.dashboard.id,
      tabId: this.props.selectedTabId,
      displayType: "button",
      action: {},
    });
  }

  onDoneEditing() {
    this.props.onEditingChange(false);
  }

  onRevert() {
    this.props.fetchDashboard({
      dashId: this.props.dashboard.id,
      queryParams: this.props.location.query,
      options: { preserveParameters: true },
    });
  }

  async onSave() {
    // optimistically dismissing all the undos before the saving has finished
    // clicking on them wouldn't do anything at this moment anyway
    this.props.dismissAllUndo();
    await this.props.updateDashboardAndCards();
    this.onDoneEditing();
  }

  onRequestCancel = () => {
    const { isDirty, isEditing } = this.props;

    if (isDirty && isEditing) {
      this.setState({ showCancelWarning: true });
    } else {
      this.onCancel();
    }
  };

  onCancel = () => {
    this.onRevert();
    this.onDoneEditing();
  };

  getEditWarning(dashboard: Dashboard) {
    if (dashboard.embedding_params) {
      const currentSlugs = Object.keys(dashboard.embedding_params);
      // are all of the original embedding params keys in the current
      // embedding params keys?
      if (
        this.props.isEditing &&
        this.props.dashboardBeforeEditing?.embedding_params &&
        Object.keys(this.props.dashboardBeforeEditing.embedding_params).some(
          slug => !currentSlugs.includes(slug),
        )
      ) {
        return t`You've updated embedded params and will need to update your embed code.`;
      }
    }
  }

  getEditingButtons() {
    const { missingRequiredParameters } = this.props;
    const disabledSaveTooltip = getDisabledSaveButtonTooltip(
      missingRequiredParameters,
    );
    const isSaveDisabled = missingRequiredParameters.length > 0;

    return [
      <Button
        key="cancel"
        className="Button Button--small mr1"
        onClick={this.onRequestCancel}
      >
        {t`Cancel`}
      </Button>,
      <Tooltip
        key="save"
        label={disabledSaveTooltip}
        disabled={!isSaveDisabled}
      >
        <span>
          <ActionButton
            actionFn={() => this.onSave()}
            className="Button Button--primary Button--small"
            normalText={t`Save`}
            activeText={t`Saving…`}
            failedText={t`Save failed`}
            successText={t`Saved`}
            disabled={isSaveDisabled}
          />
        </span>
      </Tooltip>,
    ];
  }

  getHeaderButtons() {
    const {
      dashboard,
      parametersWidget,
      isBookmarked,
      isEditing,
      isFullscreen,
      location,
      onFullscreenChange,
      createBookmark,
      deleteBookmark,
      sidebar,
      setSidebar,
      toggleSidebar,
      isShowingDashboardInfoSidebar,
      closeSidebar,
      databases,
      collection,
    } = this.props;

    const canEdit = dashboard.can_write;
    const isAnalyticsDashboard = isInstanceAnalyticsCollection(collection);

    const hasModelActionsEnabled = Object.values(databases).some(
      hasDatabaseActionsEnabled,
    );

    const buttons = [];
    const extraButtons = [];

    if (isFullscreen && parametersWidget) {
      buttons.push(parametersWidget);
    }

    if (isEditing) {
      const activeSidebarName = sidebar.name;
      const addQuestionButtonHint =
        activeSidebarName === SIDEBAR_NAME.addQuestion
          ? t`Close sidebar`
          : t`Add questions`;

      buttons.push(
        <Tooltip key="add-question-element" label={addQuestionButtonHint}>
          <DashboardHeaderButton
            icon="add"
            isActive={activeSidebarName === SIDEBAR_NAME.addQuestion}
            onClick={() => toggleSidebar(SIDEBAR_NAME.addQuestion)}
            aria-label={t`Add questions`}
          />
        </Tooltip>,
      );

      // Text/Headers
      buttons.push(
        <Tooltip
          key="dashboard-add-heading-or-text-button"
          label={t`Add a heading or text`}
        >
          <span>
            <TextOptionsButton
              onAddMarkdown={() => this.onAddMarkdownBox()}
              onAddHeading={() => this.onAddHeading()}
            />
          </span>
        </Tooltip>,
      );

      // Add link card button
      buttons.push(
        <Tooltip key="add-link-card" label={t`Add link card`}>
          <DashboardHeaderButton
            aria-label={t`Add link card`}
            onClick={() => this.onAddLinkCard()}
          >
            <Icon name="link" size={18} />
          </DashboardHeaderButton>
        </Tooltip>,
      );

      buttons.push(
        <Menu key="add-section" position="bottom-end">
          <Menu.Target>
            <span>
              <Tooltip label={t`Add section`}>
                <DashboardHeaderButton aria-label={t`Add section`}>
                  <Icon name="section" size={18} />
                </DashboardHeaderButton>
              </Tooltip>
            </span>
          </Menu.Target>
          <Menu.Dropdown>
            {layoutOptions.map(layout => (
              <Tooltip
                key={layout.id}
                label={<SectionLayoutPreview layout={layout} />}
                position="left"
              >
                <span>
                  <Menu.Item
                    onClick={() => this.onAddSection(layout)}
                    fw="bold"
                  >
                    {layout.label}
                  </Menu.Item>
                </span>
              </Tooltip>
            ))}
          </Menu.Dropdown>
        </Menu>,
      );

      const {
        isAddParameterPopoverOpen,
        showAddParameterPopover,
        hideAddParameterPopover,
        addParameter,
      } = this.props;

      // Parameters
      buttons.push(
        <span key="add-a-filter">
          <TippyPopover
            placement="bottom-start"
            onClose={hideAddParameterPopover}
            visible={isAddParameterPopoverOpen}
            content={
              <ParametersPopover
                onAddParameter={addParameter}
                onClose={hideAddParameterPopover}
              />
            }
          >
            <div>
              <Tooltip label={t`Add a filter`}>
                <DashboardHeaderButton
                  key="parameters"
                  onClick={showAddParameterPopover}
                  aria-label={t`Add a filter`}
                >
                  <Icon name="filter" />
                </DashboardHeaderButton>
              </Tooltip>
            </div>
          </TippyPopover>
        </span>,
      );

      if (canEdit && hasModelActionsEnabled) {
        buttons.push(
          <Fragment key="add-action-element">
            <DashboardHeaderActionDivider />
            <Tooltip key="add-action-button" label={t`Add action button`}>
              <DashboardHeaderButton
                onClick={() => this.onAddAction()}
                aria-label={t`Add action`}
              >
                <Icon name="click" size={18} />
              </DashboardHeaderButton>
            </Tooltip>
          </Fragment>,
        );
      }

      // Extra Buttons Menu
      buttons.push(
        <ExtraEditButtonsMenu
          key="extra-options-button"
          dashboard={dashboard}
        />,
      );

      extraButtons.push({
        title: t`Revision history`,
        icon: "history",
        link: `${location.pathname}/history`,
        event: "Dashboard;Revisions",
      });
    }

    if (isAnalyticsDashboard) {
      buttons.push(
        <Button
          icon="clone"
          to={`${location.pathname}/copy`}
          as={Link}
        >{t`Make a copy`}</Button>,
      );
    }

    if (!isFullscreen && !isEditing && canEdit) {
      buttons.push(
        <Tooltip key="edit-dashboard" label={t`Edit dashboard`}>
          <DashboardHeaderButton
            visibleOnSmallScreen={false}
            key="edit"
            aria-label={t`Edit dashboard`}
            icon="pencil"
            onClick={() => this.handleEdit(dashboard)}
          />
        </Tooltip>,
      );
    }

    if (!isFullscreen && !isEditing && !isAnalyticsDashboard) {
      extraButtons.push({
        title: t`Enter fullscreen`,
        icon: "expand",
        action: (e: MouseEvent) => onFullscreenChange(!isFullscreen, !e.altKey),
        event: `Dashboard;Fullscreen Mode;${!isFullscreen}`,
      });

      extraButtons.push({
        title: t`Duplicate`,
        icon: "clone",
        link: `${location.pathname}/copy`,
        event: "Dashboard;Copy",
      });

      extraButtons.push({
        title:
          Array.isArray(dashboard.tabs) && dashboard.tabs.length > 1
            ? t`Export tab as PDF`
            : t`Export as PDF`,
        icon: "document",
        testId: "dashboard-export-pdf-button",
        action: () => {
          this.saveAsPDF();
        },
      });

      if (canEdit) {
        extraButtons.push({
          title: t`Move`,
          icon: "move",
          link: `${location.pathname}/move`,
          event: "Dashboard;Move",
        });

        extraButtons.push({
          title: t`Archive`,
          icon: "view_archive",
          link: `${location.pathname}/archive`,
          event: "Dashboard;Archive",
        });

        extraButtons.push(...PLUGIN_DASHBOARD_HEADER.extraButtons(dashboard));
      }
    }

    buttons.push(...getDashboardActions(this, this.props));

    if (!isEditing) {
      buttons.push(
        ...[
          <DashboardHeaderActionDivider key="dashboard-button-divider" />,
          <DashboardBookmark
            key="dashboard-bookmark-button"
            dashboard={dashboard}
            onCreateBookmark={createBookmark}
            onDeleteBookmark={deleteBookmark}
            isBookmarked={isBookmarked}
          />,
          <Tooltip key="dashboard-info-button" label={t`More info`}>
            <DashboardHeaderButton
              icon="info"
              isActive={isShowingDashboardInfoSidebar}
              onClick={() =>
                isShowingDashboardInfoSidebar
                  ? closeSidebar()
                  : setSidebar({ name: SIDEBAR_NAME.info })
              }
            />
          </Tooltip>,
        ].filter(Boolean),
      );

      if (extraButtons.length > 0) {
        buttons.push(
          <EntityMenu
            key="dashboard-action-menu-button"
            triggerAriaLabel="dashboard-menu-button"
            items={extraButtons}
            triggerIcon="ellipsis"
            tooltip={t`Move, archive, and more...`}
          />,
        );
      }
    }

    if (isAnalyticsDashboard) {
      buttons.push(
        <DashboardHeaderButton
          key="expand"
          aria-label={t`Enter Fullscreen`}
          icon="expand"
          className="text-brand-hover cursor-pointer"
          onClick={e => onFullscreenChange(!isFullscreen, !e.altKey)}
        />,
      );
    }

    return buttons;
  }

  saveAsPDF = async () => {
    const { dashboard } = this.props;
    const cardNodeSelector = "#Dashboard-Cards-Container";
    await saveDashboardPdf(cardNodeSelector, dashboard.name).then(() => {
      trackExportDashboardToPDF(dashboard.id);
    });
  };

  render() {
    const {
      dashboard,
      collection,
      isEditing,
      isFullscreen,
      isNavBarOpen,
      isAdditionalInfoVisible,
      setDashboardAttribute,
      setSidebar,
      isHomepageDashboard,
    } = this.props;
    const { showCancelWarning } = this.state;
    const hasLastEditInfo = dashboard["last-edit-info"] != null;

    return (
      <>
        <DashboardHeaderComponent
          headerClassName="wrapper"
          location={this.props.location}
          dashboard={dashboard}
          collection={collection}
          isEditing={isEditing}
          isBadgeVisible={
            !isEditing && !isFullscreen && isAdditionalInfoVisible
          }
          isLastEditInfoVisible={hasLastEditInfo && isAdditionalInfoVisible}
          isEditingInfo={isEditing}
          isNavBarOpen={isNavBarOpen}
          headerButtons={this.getHeaderButtons()}
          editWarning={this.getEditWarning(dashboard)}
          editingTitle={t`You're editing this dashboard.`.concat(
            isHomepageDashboard
              ? t` Remember that this dashboard is set as homepage.`
              : "",
          )}
          editingButtons={this.getEditingButtons()}
          setDashboardAttribute={setDashboardAttribute}
          onLastEditInfoClick={() => setSidebar({ name: SIDEBAR_NAME.info })}
        />

        <Modal isOpen={showCancelWarning}>
          <LeaveConfirmationModalContent
            onAction={this.onCancel}
            onClose={this.handleCancelWarningClose}
          />
        </Modal>
      </>
    );
  }
}

function getDisabledSaveButtonTooltip(
  missingRequiredParams: UiParameter[],
): string {
  if (!missingRequiredParams.length) {
    return "";
  }

  const names = missingRequiredParams
    .map(param => `"${param.name}"`)
    .join(", ");

  return ngettext(
    msgid`The ${names} parameter requires a default value but none was provided.`,
    `The ${names} parameters require default values but none were provided.`,
    missingRequiredParams.length,
  );
}

export const DashboardHeader = _.compose(
  Bookmark.loadList(),
  Collections.load({
    id: (state: State, props: OwnProps) =>
      props.dashboard.collection_id || "root",
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(DashboardHeaderContainer);
