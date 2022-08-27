/* eslint-disable react/prop-types */
import React from "react";
import { t, jt } from "ttag";
import { getIn } from "icepick";
import _ from "underscore";

import Button from "metabase/core/components/Button";
import Icon from "metabase/components/Icon";
import InputBlurChange from "metabase/components/InputBlurChange";
import ModalContent from "metabase/components/ModalContent";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";

import { color } from "metabase/lib/colors";
import {
  hasActionsMenu,
  isTableDisplay,
  clickBehaviorIsValid,
} from "metabase/lib/click-behavior";
import { keyForColumn } from "metabase/lib/dataset";

import Sidebar from "metabase/dashboard/components/Sidebar";

import { clickBehaviorOptions, getClickBehaviorOptionName } from "./utils";
import ActionOptions from "./ActionOptions";
import Column from "./Column";
import CrossfilterOptions from "./CrossfilterOptions";
import CustomLinkText from "./CustomLinkText";
import LinkOption from "./LinkOption";
import TypeSelector from "./TypeSelector";
import ValuesYouCanReference from "./ValuesYouCanReference";
import QuestionDashboardPicker from "./QuestionDashboardPicker";
import { SidebarItemWrapper } from "./SidebarItem";
import {
  CloseIconContainer,
  Heading,
  SidebarContent,
  SidebarContentBordered,
  SidebarHeader,
  SidebarIconWrapper,
} from "./ClickBehaviorSidebar.styled";

class ClickBehaviorSidebar extends React.Component {
  state = {
    showTypeSelector: null,
    selectedColumn: null,
    originalVizSettings: null,
    originalColumnVizSettings: null,
  };

  componentDidUpdate(prevProps, prevState) {
    if (this.props.dashcard.id !== prevProps.dashcard.id) {
      this.setState({
        originalVizSettings: this.props.dashcard.visualization_settings,
      });
    }
    if (
      this.props.dashcard.id !== prevProps.dashcard.id &&
      this.state.selectedColumn != null
    ) {
      this.unsetSelectedColumn();
    }
    if (
      this.props.dashcard.id !== prevProps.dashcard.id ||
      this.state.selectedColumn !== prevState.selectedColumn
    ) {
      this.showTypeSelectorIfNeeded();
    } else {
      const curr = this.getClickBehavior() || {};
      const prev = this.getClickBehavior(prevProps) || {};
      if (curr.type !== prev.type && curr.type != null) {
        // move to next screen if the type was just changed
        this.setState({ showTypeSelector: false });
      }
    }
  }

  componentDidMount() {
    this.showTypeSelectorIfNeeded();
    if (this.props.dashcard) {
      this.setState({
        originalVizSettings: this.props.dashcard.visualization_settings,
      });
    }
  }

  setSelectedColumn = selectedColumn => {
    const originalColumnVizSettings = this.getClickBehaviorForColumn(
      this.props,
      selectedColumn,
    );
    this.setState({ selectedColumn, originalColumnVizSettings });
  };

  unsetSelectedColumn = () => {
    if (!clickBehaviorIsValid(this.getClickBehavior())) {
      this.updateSettings(this.state.originalColumnVizSettings);
    }
    this.setState({ originalColumnVizSettings: null, selectedColumn: null });
  };

  getClickBehavior(props = this.props) {
    const { dashcard } = props;
    const { selectedColumn } = this.state;
    if (isTableDisplay(dashcard) && selectedColumn == null) {
      return undefined;
    }
    if (selectedColumn == null) {
      return getIn(dashcard, ["visualization_settings", "click_behavior"]);
    } else {
      return this.getClickBehaviorForColumn(props, selectedColumn);
    }
  }

  getClickBehaviorForColumn(props, column) {
    return getIn(props.dashcard, [
      "visualization_settings",
      "column_settings",
      keyForColumn(column),
      "click_behavior",
    ]);
  }

  getColumns() {
    const { dashcard, dashcardData } = this.props;
    return getIn(dashcardData, [dashcard.card_id, "data", "cols"]);
  }

  showTypeSelectorIfNeeded() {
    const { type } = this.getClickBehavior() || {};
    this.setState({ showTypeSelector: type == null });
  }

  updateSettings = (
    click_behavior,
    { props = this.props, state = this.state } = {},
  ) => {
    const { selectedColumn } = state;
    const { id } = props.dashcard;
    if (selectedColumn == null) {
      props.onUpdateDashCardVisualizationSettings(id, { click_behavior });
    } else {
      props.onUpdateDashCardColumnSettings(id, keyForColumn(selectedColumn), {
        click_behavior,
      });
    }
  };

  handleCancel = () => {
    this.props.onReplaceAllDashCardVisualizationSettings(
      this.props.dashcard.id,
      this.state.originalVizSettings,
    );
    this.props.hideClickBehaviorSidebar();
  };

  render() {
    const { dashboard, dashcard, parameters, hideClickBehaviorSidebar } =
      this.props;
    const { selectedColumn } = this.state;

    const clickBehavior = this.getClickBehavior() || { type: "menu" };

    if (isTableDisplay(dashcard) && selectedColumn == null) {
      return (
        <Sidebar
          onClose={hideClickBehaviorSidebar}
          onCancel={this.handleCancel}
          closeIsDisabled={!clickBehaviorIsValid(clickBehavior)}
        >
          <SidebarHeader>
            <Heading className="text-paragraph">{t`On-click behavior for each column`}</Heading>
          </SidebarHeader>
          <div>
            {_.chain(this.getColumns())
              .map(column => ({
                column,
                clickBehavior: this.getClickBehaviorForColumn(
                  this.props,
                  column,
                ),
              }))
              .groupBy(({ clickBehavior }) => {
                const { type = "actionMenu" } = clickBehavior || {};
                return type;
              })
              .pairs()
              .sortBy(([linkType]) =>
                ["link", "crossfilter", "actionMenu"].indexOf(linkType),
              )
              .map(([linkType, columnsWithClickBehavior]) => (
                <div key={linkType} className="mb2 px4">
                  <h5 className="text-uppercase text-medium my1">
                    {
                      {
                        link: t`Go to custom destination`,
                        crossfilter: t`Update a dashboard filter`,
                        actionMenu: hasActionsMenu(dashcard)
                          ? t`Open the actions menu`
                          : t`Do nothing`,
                      }[linkType]
                    }
                  </h5>
                  {columnsWithClickBehavior.map(
                    ({ column, clickBehavior }, index) => (
                      <Column
                        key={index}
                        column={column}
                        clickBehavior={clickBehavior}
                        onClick={() => this.setSelectedColumn(column)}
                      />
                    ),
                  )}
                </div>
              ))
              .value()}
          </div>
        </Sidebar>
      );
    }

    const { showTypeSelector } = this.state;
    if (showTypeSelector === null) {
      return null;
    }
    return (
      <Sidebar
        onClose={hideClickBehaviorSidebar}
        onCancel={this.handleCancel}
        closeIsDisabled={!clickBehaviorIsValid(clickBehavior)}
      >
        <SidebarHeader>
          {selectedColumn == null ? (
            <Heading>{jt`Click behavior for ${(
              <span className="text-brand">{dashcard.card.name}</span>
            )}`}</Heading>
          ) : (
            <div
              onClick={this.unsetSelectedColumn}
              className="flex align-center text-brand-hover cursor-pointer"
            >
              <div
                className="bordered"
                style={{
                  marginRight: 8,
                  paddingTop: 4,
                  paddingBottom: 4,
                  paddingRight: 6,
                  paddingLeft: 6,
                  borderRadius: 4,
                }}
              >
                <Icon name="chevronleft" className="text-medium" size={12} />
              </div>
              <Heading>
                {jt`Click behavior for ${(
                  <span className="text-brand">
                    {selectedColumn.display_name}
                  </span>
                )}`}
              </Heading>
            </div>
          )}
        </SidebarHeader>
        <div>
          {showTypeSelector ? (
            <SidebarContent>
              <TypeSelector
                clickBehavior={clickBehavior}
                dashcard={dashcard}
                parameters={this.props.parameters}
                updateSettings={this.updateSettings}
                moveToNextPage={() =>
                  this.setState({ showTypeSelector: false })
                }
              />
            </SidebarContent>
          ) : (
            <div>
              <SidebarContentBordered>
                <SidebarItemWrapper
                  onClick={() => this.setState({ showTypeSelector: true })}
                  style={{
                    backgroundColor: color("brand"),
                    color: color("white"),
                  }}
                >
                  <SidebarIconWrapper
                    style={{ borderColor: "transparent", paddingLeft: 12 }}
                  >
                    <Icon
                      name={
                        clickBehaviorOptions.find(
                          o => o.value === clickBehavior.type,
                        ).icon
                      }
                    />
                  </SidebarIconWrapper>
                  <div className="flex align-center full">
                    <h4>
                      {getClickBehaviorOptionName(clickBehavior.type, dashcard)}
                    </h4>
                    <CloseIconContainer>
                      <Icon name="close" size={12} />
                    </CloseIconContainer>
                  </div>
                </SidebarItemWrapper>
              </SidebarContentBordered>

              {clickBehavior.type === "link" ? (
                <LinkOptions
                  clickBehavior={clickBehavior}
                  dashcard={dashcard}
                  parameters={parameters}
                  updateSettings={this.updateSettings}
                />
              ) : clickBehavior.type === "crossfilter" ? (
                <CrossfilterOptions
                  clickBehavior={clickBehavior}
                  dashboard={dashboard}
                  dashcard={dashcard}
                  updateSettings={this.updateSettings}
                />
              ) : clickBehavior.type === "action" ? (
                <ActionOptions
                  clickBehavior={clickBehavior}
                  dashcard={dashcard}
                  parameters={parameters}
                  updateSettings={this.updateSettings}
                />
              ) : null}
            </div>
          )}
        </div>
      </Sidebar>
    );
  }
}

function LinkOptions({ clickBehavior, updateSettings, dashcard, parameters }) {
  const linkTypeOptions = [
    { type: "dashboard", icon: "dashboard", name: t`Dashboard` },
    { type: "question", icon: "bar", name: t`Saved question` },
    { type: "url", icon: "link", name: t`URL` },
  ];

  return (
    <SidebarContent>
      <p className="text-medium mt3 mb1">{t`Link to`}</p>
      <div>
        {clickBehavior.linkType == null ? (
          linkTypeOptions.map(({ type, icon, name }, index) => (
            <LinkOption
              key={name}
              option={name}
              icon={icon}
              onClick={() =>
                updateSettings({ type: clickBehavior.type, linkType: type })
              }
            />
          ))
        ) : clickBehavior.linkType === "url" ? (
          <ModalWithTrigger
            isInitiallyOpen={clickBehavior.linkTemplate == null}
            triggerElement={
              <SidebarItemWrapper
                style={{
                  backgroundColor: color("brand"),
                  color: color("white"),
                }}
              >
                <SidebarIconWrapper
                  style={{ borderColor: "transparent", marginLeft: 8 }}
                >
                  <Icon name="link" />
                </SidebarIconWrapper>
                <div className="flex align-center full">
                  <h4 className="pr1">
                    {clickBehavior.linkTemplate
                      ? clickBehavior.linkTemplate
                      : t`URL`}
                  </h4>
                  <CloseIconContainer
                    onClick={() =>
                      updateSettings({
                        type: clickBehavior.type,
                        linkType: null,
                      })
                    }
                  >
                    <Icon name="close" size={12} />
                  </CloseIconContainer>
                </div>
              </SidebarItemWrapper>
            }
          >
            {({ onClose }) => (
              <ModalContent
                title={t`Enter a URL to link to`}
                onClose={clickBehavior.targetId != null ? onClose : null}
              >
                <div className="mb1">{t`You can insert the value of a column or dashboard filter using its name, like this: {{some_column}}`}</div>
                <InputBlurChange
                  autoFocus
                  className="input block full"
                  placeholder={t`e.g. http://acme.com/id/\{\{user_id\}\}`}
                  value={clickBehavior.linkTemplate}
                  onChange={e =>
                    updateSettings({
                      ...clickBehavior,
                      linkTemplate: e.target.value,
                    })
                  }
                />
                {isTableDisplay(dashcard) && (
                  <CustomLinkText
                    updateSettings={updateSettings}
                    clickBehavior={clickBehavior}
                  />
                )}
                <ValuesYouCanReference
                  dashcard={dashcard}
                  parameters={parameters}
                />
                <div className="flex">
                  <Button
                    primary
                    onClick={() => onClose()}
                    className="ml-auto mt2"
                    disabled={!clickBehaviorIsValid(clickBehavior)}
                  >{t`Done`}</Button>
                </div>
              </ModalContent>
            )}
          </ModalWithTrigger>
        ) : (
          <div></div>
        )}
      </div>
      <div className="mt1">
        {clickBehavior.linkType != null && clickBehavior.linkType !== "url" && (
          <div>
            <QuestionDashboardPicker
              dashcard={dashcard}
              clickBehavior={clickBehavior}
              updateSettings={updateSettings}
            />
            {isTableDisplay(dashcard) && (
              <div>
                <CustomLinkText
                  updateSettings={updateSettings}
                  clickBehavior={clickBehavior}
                />
                <ValuesYouCanReference
                  dashcard={dashcard}
                  parameters={parameters}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </SidebarContent>
  );
}

export default ClickBehaviorSidebar;
