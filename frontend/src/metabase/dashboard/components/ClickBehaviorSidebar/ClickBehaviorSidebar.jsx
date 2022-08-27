/* eslint-disable react/prop-types */
import React from "react";
import { jt } from "ttag";
import { getIn } from "icepick";

import Icon from "metabase/components/Icon";

import { color } from "metabase/lib/colors";
import {
  isTableDisplay,
  clickBehaviorIsValid,
} from "metabase/lib/click-behavior";
import { keyForColumn } from "metabase/lib/dataset";

import Sidebar from "metabase/dashboard/components/Sidebar";

import { clickBehaviorOptions, getClickBehaviorOptionName } from "./utils";
import ActionOptions from "./ActionOptions";
import CrossfilterOptions from "./CrossfilterOptions";
import LinkOptions from "./LinkOptions";
import TableClickBehaviorView from "./TableClickBehaviorView";
import TypeSelector from "./TypeSelector";
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
        <TableClickBehaviorView
          columns={this.getColumns()}
          dashcard={dashcard}
          getClickBehaviorForColumn={column =>
            this.getClickBehaviorForColumn(this.props, column)
          }
          canClose={clickBehaviorIsValid(clickBehavior)}
          onColumnClick={this.setSelectedColumn}
          onCancel={this.handleCancel}
          onClose={hideClickBehaviorSidebar}
        />
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

export default ClickBehaviorSidebar;
