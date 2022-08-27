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
    const { dashcard } = this.props;
    const { dashcard: previousDashcard } = prevProps;
    const { selectedColumn } = this.state;
    const { selectedColumn: previousSelectedColumn } = prevState;

    const hasSelectedColumn = selectedColumn != null;
    const pickedAnotherDashcard = dashcard.id !== previousDashcard.id;
    const selectedAnotherColumn = selectedColumn !== previousSelectedColumn;

    if (pickedAnotherDashcard) {
      this.setState({ originalVizSettings: dashcard.visualization_settings });
    }

    if (pickedAnotherDashcard && hasSelectedColumn) {
      this.unsetSelectedColumn();
    }

    if (pickedAnotherDashcard || selectedAnotherColumn) {
      this.showTypeSelectorIfNeeded();
    } else {
      const clickBehavior = this.getClickBehavior() || {};
      const previousClickBehavior = this.getClickBehavior(prevProps) || {};
      const changedClickBehaviorType =
        clickBehavior.type != null &&
        clickBehavior.type !== previousClickBehavior.type;
      if (changedClickBehaviorType) {
        // move to next screen if the type was just changed
        this.setState({ showTypeSelector: false });
      }
    }
  }

  componentDidMount() {
    const { dashcard } = this.props;
    this.showTypeSelectorIfNeeded();
    if (dashcard) {
      this.setState({ originalVizSettings: dashcard.visualization_settings });
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
    const { originalColumnVizSettings } = this.state;
    const clickBehavior = this.getClickBehavior();

    if (!clickBehaviorIsValid(clickBehavior)) {
      this.updateSettings(originalColumnVizSettings);
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
    const {
      dashcard,
      onReplaceAllDashCardVisualizationSettings,
      hideClickBehaviorSidebar,
    } = this.props;
    const { originalVizSettings } = this.state;
    onReplaceAllDashCardVisualizationSettings(dashcard.id, originalVizSettings);
    hideClickBehaviorSidebar();
  };

  showTypeSelector = () => {
    this.setState({ showTypeSelector: true });
  };

  hideTypeSelector = () => {
    this.setState({ showTypeSelector: false });
  };

  renderContent = () => {
    const { dashboard, dashcard, parameters } = this.props;
    const { selectedColumn, showTypeSelector } = this.state;

    const clickBehavior = this.getClickBehavior() || { type: "menu" };

    if (isTableDisplay(dashcard) && selectedColumn == null) {
      return (
        <TableClickBehaviorView
          columns={this.getColumns()}
          dashcard={dashcard}
          getClickBehaviorForColumn={column =>
            this.getClickBehaviorForColumn(this.props, column)
          }
          onColumnClick={this.setSelectedColumn}
        />
      );
    }

    if (showTypeSelector) {
      return (
        <SidebarContent>
          <TypeSelector
            clickBehavior={clickBehavior}
            dashcard={dashcard}
            parameters={parameters}
            updateSettings={this.updateSettings}
            moveToNextPage={this.hideTypeSelector}
          />
        </SidebarContent>
      );
    }

    return (
      <ClickBehaviorSidebarMainView
        clickBehavior={clickBehavior}
        dashboard={dashboard}
        dashcard={dashcard}
        parameters={parameters}
        handleShowTypeSelector={this.showTypeSelector}
        updateSettings={this.updateSettings}
      />
    );
  };

  render() {
    const { dashcard, hideClickBehaviorSidebar } = this.props;
    const { selectedColumn, showTypeSelector } = this.state;
    const hasSelectedColumn = selectedColumn != null;

    const clickBehavior = this.getClickBehavior() || { type: "menu" };

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
          hasSelectedColumn={hasSelectedColumn}
          onUnsetColumn={this.unsetSelectedColumn}
        />
        <div>{this.renderContent()}</div>
      </Sidebar>
    );
  }
}

export default ClickBehaviorSidebar;
