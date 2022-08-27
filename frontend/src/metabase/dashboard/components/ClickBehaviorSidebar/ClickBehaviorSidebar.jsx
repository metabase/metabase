/* eslint-disable react/prop-types */
import React from "react";
import { getIn } from "icepick";

import {
  isTableDisplay,
  clickBehaviorIsValid,
} from "metabase/lib/click-behavior";
import { keyForColumn } from "metabase/lib/dataset";

import Sidebar from "metabase/dashboard/components/Sidebar";

import ClickBehaviorSidebarHeader from "./ClickBehaviorSidebarHeader";
import ClickBehaviorSidebarMainView from "./ClickBehaviorSidebarMainView";
import TableClickBehaviorView from "./TableClickBehaviorView";
import TypeSelector from "./TypeSelector";
import { SidebarContent } from "./ClickBehaviorSidebar.styled";

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
        <ClickBehaviorSidebarHeader
          dashcard={dashcard}
          selectedColumn={selectedColumn}
          hasSelectedColumn={selectedColumn != null}
        />
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
            <ClickBehaviorSidebarMainView
              clickBehavior={clickBehavior}
              dashboard={dashboard}
              dashcard={dashcard}
              parameters={parameters}
            />
          )}
        </div>
      </Sidebar>
    );
  }
}

export default ClickBehaviorSidebar;
