import type { Location } from "history";
import { type MouseEvent, type ReactNode, useState, Fragment } from "react";
import { useMount } from "react-use";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import {
  useBookmarkListQuery,
  useCollectionQuery,
} from "metabase/common/hooks";
import ActionButton from "metabase/components/ActionButton";
import EntityMenu from "metabase/components/EntityMenu";
import { LeaveConfirmationModalContent } from "metabase/components/LeaveConfirmationModal";
import Modal from "metabase/components/Modal";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link/Link";
import type { NewDashCardOpts } from "metabase/dashboard/actions";
import {
  addActionToDashboard,
  addSectionToDashboard,
  toggleSidebar,
} from "metabase/dashboard/actions";
import { trackExportDashboardToPDF } from "metabase/dashboard/analytics";
import { getDashboardActions } from "metabase/dashboard/components/DashboardActions";
import { DashboardBookmark } from "metabase/dashboard/components/DashboardBookmark";
import { ParametersPopover } from "metabase/dashboard/components/ParametersPopover";
import { TextOptionsButton } from "metabase/dashboard/components/TextOptions/TextOptionsButton";
import type { SectionLayout } from "metabase/dashboard/sections";
import { layoutOptions } from "metabase/dashboard/sections";
import {
  getIsShowDashboardInfoSidebar,
  getMissingRequiredParameters,
} from "metabase/dashboard/selectors";
import type { FetchDashboardResult } from "metabase/dashboard/types";
import { hasDatabaseActionsEnabled } from "metabase/dashboard/utils";
import Bookmark from "metabase/entities/bookmarks";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { PLUGIN_DASHBOARD_HEADER } from "metabase/plugins";
import { fetchPulseFormInput } from "metabase/pulse/actions";
import { getPulseFormInput } from "metabase/pulse/selectors";
import { dismissAllUndo } from "metabase/redux/undo";
import { getIsNavbarOpen } from "metabase/selectors/app";
import { getSetting } from "metabase/selectors/settings";
import { Icon, Menu, Tooltip, Loader, Flex } from "metabase/ui";
import { saveDashboardPdf } from "metabase/visualizations/lib/save-dashboard-pdf";
import type { UiParameter } from "metabase-lib/parameters/types";
import type {
  Bookmark as IBookmark,
  DashboardId,
  DashboardTabId,
  Dashboard,
  DatabaseId,
  Database,
  CardId,
  ParameterMappingOptions,
} from "metabase-types/api";
import type {
  DashboardSidebarName,
  DashboardSidebarState,
} from "metabase-types/store";

import { SIDEBAR_NAME } from "../../constants";
import { ExtraEditButtonsMenu } from "../ExtraEditButtonsMenu/ExtraEditButtonsMenu";

import {
  DashboardHeaderButton,
  DashboardHeaderActionDivider,
} from "./DashboardHeader.styled";
import { DashboardHeaderComponent } from "./DashboardHeaderView";
import { SectionLayoutPreview } from "./SectionLayoutPreview";

interface DashboardHeaderProps {
  dashboardId: DashboardId;
  dashboard: Dashboard;
  dashboardBeforeEditing?: Dashboard | null;
  databases: Record<DatabaseId, Database>;
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
  parametersWidget?: ReactNode;

  addCardToDashboard: (opts: {
    dashId: DashboardId;
    cardId: CardId;
    tabId: DashboardTabId | null;
  }) => void;
  addHeadingDashCardToDashboard: (opts: NewDashCardOpts) => void;
  addMarkdownDashCardToDashboard: (opts: NewDashCardOpts) => void;
  addLinkDashCardToDashboard: (opts: NewDashCardOpts) => void;

  fetchDashboard: (opts: {
    dashId: DashboardId;
    queryParams?: Record<string, unknown>;
    options?: {
      clearCache?: boolean;
      preserveParameters?: boolean;
    };
  }) => Promise<FetchDashboardResult>;
  setDashboardAttribute: <Key extends keyof Dashboard>(
    key: Key,
    value: Dashboard[Key],
  ) => void;
  setRefreshElapsedHook?: (hook: (elapsed: number) => void) => void;
  updateDashboardAndCards: () => void;

  addParameter: (option: ParameterMappingOptions) => void;
  showAddParameterPopover: () => void;
  hideAddParameterPopover: () => void;

  onEditingChange: (arg: Dashboard | null) => void;
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

export const DashboardHeader = (props: DashboardHeaderProps) => {
  const {
    onEditingChange,
    addMarkdownDashCardToDashboard,
    addHeadingDashCardToDashboard,
    addLinkDashCardToDashboard,
    fetchDashboard,
    updateDashboardAndCards,
    dashboardBeforeEditing,
    isDirty,
    isEditing,
    location,
    dashboard,
    parametersWidget,
    isFullscreen,
    onFullscreenChange,
    sidebar,
    setSidebar,
    closeSidebar,
    databases,
    isAddParameterPopoverOpen,
    showAddParameterPopover,
    hideAddParameterPopover,
    addParameter,
    isAdditionalInfoVisible,
    setDashboardAttribute,
  } = props;

  const [showCancelWarning, setShowCancelWarning] = useState(false);

  useMount(() => {
    dispatch(fetchPulseFormInput());
  });

  const dispatch = useDispatch();

  const formInput = useSelector(getPulseFormInput);
  const isNavBarOpen = useSelector(getIsNavbarOpen);
  const isShowingDashboardInfoSidebar = useSelector(
    getIsShowDashboardInfoSidebar,
  );
  const selectedTabId = useSelector(state => state.dashboard.selectedTabId);
  const isHomepageDashboard = useSelector(
    state =>
      getSetting(state, "custom-homepage") &&
      getSetting(state, "custom-homepage-dashboard") === dashboard?.id,
  );
  const missingRequiredParameters = useSelector(getMissingRequiredParameters);

  const { data: collection, isLoading: isLoadingCollection } =
    useCollectionQuery({ id: dashboard.collection_id || "root" });

  const { data: bookmarks = [] } = useBookmarkListQuery();

  const isBookmarked = getIsBookmarked({
    dashboardId: dashboard.id,
    bookmarks,
  });

  const handleEdit = (dashboard: Dashboard) => {
    onEditingChange(dashboard);
  };

  const handleCancelWarningClose = () => {
    setShowCancelWarning(false);
  };

  const handleCreateBookmark = ({ id }: { id: DashboardId }) => {
    dispatch(Bookmark.actions.create({ id, type: "dashboard" }));
  };

  const handleDeleteBookmark = ({ id }: { id: DashboardId }) => {
    dispatch(Bookmark.actions.delete({ id, type: "dashboard" }));
  };

  const onAddMarkdownBox = () => {
    addMarkdownDashCardToDashboard({
      dashId: dashboard.id,
      tabId: selectedTabId,
    });
  };

  const onAddHeading = () => {
    addHeadingDashCardToDashboard({
      dashId: dashboard.id,
      tabId: selectedTabId,
    });
  };

  const onAddLinkCard = () => {
    addLinkDashCardToDashboard({
      dashId: dashboard.id,
      tabId: selectedTabId,
    });
  };

  const onAddSection = (sectionLayout: SectionLayout) => {
    dispatch(
      addSectionToDashboard({
        dashId: dashboard.id,
        tabId: selectedTabId,
        sectionLayout,
      }),
    );
  };

  const onAddAction = () => {
    dispatch(
      addActionToDashboard({
        dashId: dashboard.id,
        tabId: selectedTabId,
        displayType: "button",
        action: {},
      }),
    );
  };

  const onDoneEditing = () => {
    onEditingChange(null);
  };

  const onRevert = () => {
    fetchDashboard({
      dashId: dashboard.id,
      queryParams: location.query,
      options: { preserveParameters: true },
    });
  };

  const onSave = async () => {
    // optimistically dismissing all the undos before the saving has finished
    // clicking on them wouldn't do anything at this moment anyway
    dispatch(dismissAllUndo());
    await updateDashboardAndCards();

    onDoneEditing();
  };

  const onRequestCancel = () => {
    if (isDirty && isEditing) {
      setShowCancelWarning(true);
    } else {
      onCancel();
    }
  };

  const onCancel = () => {
    onRevert();
    onDoneEditing();
  };

  const saveAsPDF = async () => {
    const cardNodeSelector = "#Dashboard-Cards-Container";
    await saveDashboardPdf(cardNodeSelector, dashboard.name).then(() => {
      trackExportDashboardToPDF(dashboard.id);
    });
  };

  const getEditWarning = (dashboard: Dashboard) => {
    if (dashboard.embedding_params) {
      const currentSlugs = Object.keys(dashboard.embedding_params);
      // are all of the original embedding params keys in the current
      // embedding params keys?
      if (
        isEditing &&
        dashboardBeforeEditing?.embedding_params &&
        Object.keys(dashboardBeforeEditing.embedding_params).some(
          slug => !currentSlugs.includes(slug),
        )
      ) {
        return t`You've updated embedded params and will need to update your embed code.`;
      }
    }
  };

  const getEditingButtons = () => {
    const disabledSaveTooltip = getDisabledSaveButtonTooltip(
      missingRequiredParameters,
    );
    const isSaveDisabled = missingRequiredParameters.length > 0;

    return [
      <Button
        key="cancel"
        className="Button Button--small mr1"
        onClick={() => onRequestCancel()}
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
            actionFn={() => onSave()}
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
  };

  const getHeaderButtons = () => {
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
            onClick={() => dispatch(toggleSidebar(SIDEBAR_NAME.addQuestion))}
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
              onAddMarkdown={() => onAddMarkdownBox()}
              onAddHeading={() => onAddHeading()}
            />
          </span>
        </Tooltip>,
      );

      // Add link card button
      const addLinkLabel = t`Add link card`;
      buttons.push(
        <Tooltip key="add-link-card" label={addLinkLabel}>
          <DashboardHeaderButton
            aria-label={addLinkLabel}
            onClick={() => onAddLinkCard()}
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
                  <Menu.Item onClick={() => onAddSection(layout)} fw="bold">
                    {layout.label}
                  </Menu.Item>
                </span>
              </Tooltip>
            ))}
          </Menu.Dropdown>
        </Menu>,
      );

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
                onClick={() => onAddAction()}
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
            onClick={() => handleEdit(dashboard)}
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
          saveAsPDF();
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

    buttons.push(...getDashboardActions({ ...props, formInput }));

    if (!isEditing) {
      buttons.push(
        ...[
          <DashboardHeaderActionDivider key="dashboard-button-divider" />,
          <DashboardBookmark
            key="dashboard-bookmark-button"
            dashboard={dashboard}
            onCreateBookmark={handleCreateBookmark}
            onDeleteBookmark={handleDeleteBookmark}
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

    return { buttons };
  };

  if (isLoadingCollection || !collection) {
    return (
      <Flex justify="center" py="1.5rem">
        <Loader size={29} />
      </Flex>
    );
  }

  const hasLastEditInfo = dashboard["last-edit-info"] != null;

  const { buttons: headerButtons } = getHeaderButtons();
  const editingButtons = getEditingButtons();

  return (
    <>
      <DashboardHeaderComponent
        headerClassName="wrapper"
        location={location}
        dashboard={dashboard}
        collection={collection}
        isEditing={isEditing}
        isBadgeVisible={!isEditing && !isFullscreen && isAdditionalInfoVisible}
        isLastEditInfoVisible={hasLastEditInfo && isAdditionalInfoVisible}
        isEditingInfo={isEditing}
        isNavBarOpen={isNavBarOpen}
        headerButtons={headerButtons}
        editWarning={getEditWarning(dashboard)}
        editingTitle={t`You're editing this dashboard.`.concat(
          isHomepageDashboard
            ? t` Remember that this dashboard is set as homepage.`
            : "",
        )}
        editingButtons={editingButtons}
        setDashboardAttribute={setDashboardAttribute}
        onLastEditInfoClick={() => setSidebar({ name: SIDEBAR_NAME.info })}
      />

      <Modal isOpen={showCancelWarning}>
        <LeaveConfirmationModalContent
          onAction={onCancel}
          onClose={handleCancelWarningClose}
        />
      </Modal>
    </>
  );
};

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

type IsBookmarkedSelectorProps = {
  bookmarks: IBookmark[];
  dashboardId: DashboardId;
};

export const getIsBookmarked = ({
  bookmarks,
  dashboardId,
}: IsBookmarkedSelectorProps) =>
  bookmarks.some(
    bookmark =>
      bookmark.type === "dashboard" && bookmark.item_id === dashboardId,
  );
