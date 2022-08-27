/* eslint-disable react/prop-types */
import React from "react";
import { t, jt } from "ttag";
import { getIn } from "icepick";
import _ from "underscore";
import cx from "classnames";

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

import Actions from "metabase/entities/actions";
import Dashboards from "metabase/entities/dashboards";
import Questions from "metabase/entities/questions";

import DashboardPicker from "metabase/containers/DashboardPicker";
import QuestionPicker from "metabase/containers/QuestionPicker";

import Sidebar from "metabase/dashboard/components/Sidebar";
import ClickMappings, {
  clickTargetObjectType,
} from "metabase/dashboard/components/ClickMappings";

import { clickBehaviorOptions, getClickBehaviorOptionName } from "./utils";
import Column from "./Column";
import CustomLinkText from "./CustomLinkText";
import LinkOption from "./LinkOption";
import ValuesYouCanReference from "./ValuesYouCanReference";
import {
  SidebarItemWrapper,
  SidebarItemClasses,
  SidebarItemStyle,
} from "./SidebarItem";
import {
  CloseIconContainer,
  Heading,
  SidebarContent,
  SidebarContentBordered,
  SidebarHeader,
  SidebarIconWrapper,
  SidebarItem,
} from "./ClickBehaviorSidebar.styled";

const BehaviorOption = ({
  option,
  icon,
  onClick,
  hasNextStep,
  selected,
  disabled,
}) => (
  <SidebarItemWrapper
    style={{
      ...SidebarItemStyle,
      backgroundColor: selected ? color("brand") : "transparent",
      color: selected ? color("white") : "inherit",
    }}
    onClick={onClick}
    disabled={disabled}
  >
    <SidebarIconWrapper style={{ borderColor: selected && "transparent" }}>
      <Icon
        name={selected ? "check" : icon}
        color={selected ? color("white") : color("brand")}
      />
    </SidebarIconWrapper>
    <div className="flex align-center full">
      <h4>{option}</h4>
      {hasNextStep && (
        <span className="ml-auto">
          <Icon name="chevronright" size={12} />
        </span>
      )}
    </div>
  </SidebarItemWrapper>
);

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

function TypeSelector({
  updateSettings,
  clickBehavior,
  dashcard,
  parameters,
  moveToNextPage,
}) {
  return (
    <div>
      {clickBehaviorOptions.map(({ value, icon }) => (
        <div key={value} className="mb1">
          <BehaviorOption
            onClick={() => {
              if (value !== clickBehavior.type) {
                updateSettings(value === "menu" ? undefined : { type: value });
              } else if (value !== "menu") {
                moveToNextPage(); // if it didn't change, we need to advance here rather than in `componentDidUpdate`
              }
            }}
            icon={icon}
            option={getClickBehaviorOptionName(value, dashcard)}
            hasNextStep={value !== "menu"}
            selected={clickBehavior.type === value}
            disabled={value === "crossfilter" && parameters.length === 0}
          />
        </div>
      ))}
    </div>
  );
}

const ActionOption = ({ name, description, isSelected, onClick }) => {
  return (
    <SidebarItemWrapper
      onClick={onClick}
      style={{
        ...SidebarItemStyle,
        backgroundColor: isSelected ? color("brand") : "transparent",
        color: isSelected ? color("white") : "inherit",
        alignItems: description ? "flex-start" : "center",
        marginTop: "2px",
      }}
    >
      <SidebarIconWrapper>
        <Icon
          name="bolt"
          color={isSelected ? color("text-white") : color("brand")}
        />
      </SidebarIconWrapper>
      <div>
        <h4>{name}</h4>
        {description && (
          <span
            className={isSelected ? "text-white" : "text-medium"}
            style={{ width: "95%", marginTop: "2px" }}
          >
            {description}
          </span>
        )}
      </div>
    </SidebarItemWrapper>
  );
};

function ActionOptions({ dashcard, clickBehavior, updateSettings }) {
  return (
    <SidebarContent>
      <Heading className="text-medium">{t`Pick an action`}</Heading>
      <Actions.ListLoader>
        {({ actions }) => {
          const selectedAction = actions.find(
            action => action.id === clickBehavior.action,
          );
          return (
            <>
              {actions.map(action => (
                <ActionOption
                  key={action.id}
                  name={action.name}
                  description={action.description}
                  isSelected={clickBehavior.action === action.id}
                  onClick={() =>
                    updateSettings({
                      type: clickBehavior.type,
                      action: action.id,
                      emitter_id: clickBehavior.emitter_id,
                    })
                  }
                />
              ))}
              {selectedAction && (
                <ClickMappings
                  isAction
                  object={selectedAction}
                  dashcard={dashcard}
                  clickBehavior={clickBehavior}
                  updateSettings={updateSettings}
                />
              )}
            </>
          );
        }}
      </Actions.ListLoader>
    </SidebarContent>
  );
}

function CrossfilterOptions({
  clickBehavior,
  dashboard,
  dashcard,
  updateSettings,
}) {
  return (
    <SidebarContent>
      <Heading className="text-medium">{t`Pick one or more filters to update`}</Heading>
      <ClickMappings
        object={dashboard}
        dashcard={dashcard}
        isDash
        clickBehavior={clickBehavior}
        updateSettings={updateSettings}
        excludeParametersSources
      />
    </SidebarContent>
  );
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

function QuestionDashboardPicker({ dashcard, clickBehavior, updateSettings }) {
  const isDash = clickBehavior.linkType === "dashboard";
  const Entity = isDash ? Dashboards : Questions;
  const Picker = isDash ? DashboardPicker : QuestionPicker;
  return (
    <div>
      <div className="pb1">
        <ModalWithTrigger
          triggerElement={
            <div
              className={cx(SidebarItemClasses, "overflow-hidden")}
              style={{
                marginLeft: SidebarItemStyle.marginLeft,
                marginRight: SidebarItemStyle.marginRight,
                backgroundColor: color("brand"),
                color: color("white"),
              }}
            >
              <SidebarItem
                style={{
                  paddingLeft: SidebarItemStyle.paddingLeft,
                  paddingRight: SidebarItemStyle.paddingRight,
                  paddingTop: SidebarItemStyle.paddingTop,
                  paddingBottom: SidebarItemStyle.paddingBottom,
                }}
              >
                <SidebarIconWrapper style={{ borderColor: "transparent" }}>
                  <Icon name={isDash ? "dashboard" : "bar"} />
                </SidebarIconWrapper>
                <div className="flex align-center full text-bold">
                  {clickBehavior.targetId == null ? (
                    isDash ? (
                      t`Pick a dashboard...`
                    ) : (
                      t`Pick a question...`
                    )
                  ) : (
                    <Entity.Name id={clickBehavior.targetId} />
                  )}
                  <Icon name="chevrondown" size={12} className="ml-auto" />
                </div>
              </SidebarItem>
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
          }
          isInitiallyOpen={clickBehavior.targetId == null}
        >
          {({ onClose }) => (
            <ModalContent
              title={
                isDash
                  ? t`Pick a dashboard to link to`
                  : t`Pick a question to link to`
              }
              onClose={clickBehavior.targetId != null ? onClose : null}
            >
              <Picker
                value={clickBehavior.targetId}
                onChange={targetId => {
                  updateSettings({
                    ...clickBehavior,
                    ...(targetId !== clickBehavior.targetId
                      ? { parameterMapping: {} }
                      : {}),
                    targetId,
                  });
                  onClose();
                }}
              />
            </ModalContent>
          )}
        </ModalWithTrigger>
      </div>
      {clickBehavior.targetId != null && (
        <Entity.Loader id={clickBehavior.targetId}>
          {({ object }) => (
            <div className="pt1">
              <Heading>
                {
                  {
                    dashboard: t`Pass values to this dashboard's filters (optional)`,
                    native: t`Pass values to this question's variables (optional)`,
                    gui: t`Pass values to filter this question (optional)`,
                  }[clickTargetObjectType(object)]
                }
              </Heading>
              <ClickMappings
                object={object}
                dashcard={dashcard}
                isDash={isDash}
                clickBehavior={clickBehavior}
                updateSettings={updateSettings}
              />
            </div>
          )}
        </Entity.Loader>
      )}
    </div>
  );
}

export default ClickBehaviorSidebar;
