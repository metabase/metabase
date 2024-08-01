/* eslint-disable react/prop-types */
import { assocIn } from "icepick";
import { Component } from "react";
import * as React from "react";
import { t } from "ttag";
import _ from "underscore";

import Button from "metabase/core/components/Button";
import Radio from "metabase/core/components/Radio";
import CS from "metabase/css/core/index.css";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import {
  getVisualizationTransformed,
  extractRemappings,
} from "metabase/visualizations";
import Visualization from "metabase/visualizations/components/Visualization";
import { updateSeriesColor } from "metabase/visualizations/lib/series";
import {
  updateSettings,
  getClickBehaviorSettings,
  getComputedSettings,
  getSettingsWidgets,
} from "metabase/visualizations/lib/settings";
import { getSettingDefinitionsForColumn } from "metabase/visualizations/lib/settings/column";
import { keyForSingleSeries } from "metabase/visualizations/lib/settings/series";
import { getSettingsWidgetsForSeries } from "metabase/visualizations/lib/settings/visualization";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";

import {
  SectionContainer,
  SectionWarnings,
  ChartSettingsRoot,
  ChartSettingsMenu,
  ChartSettingsPreview,
  ChartSettingsListContainer,
  ChartSettingsVisualizationContainer,
  ChartSettingsFooterRoot,
} from "./ChartSettings.styled";
import ChartSettingsWidgetList from "./ChartSettingsWidgetList";
import ChartSettingsWidgetPopover from "./ChartSettingsWidgetPopover";

// section names are localized
const DEFAULT_TAB_PRIORITY = [t`Data`];

/**
 * @deprecated HOCs are deprecated
 */
const withTransientSettingState = ComposedComponent =>
  class extends React.Component {
    static displayName = `withTransientSettingState[${
      ComposedComponent.displayName || ComposedComponent.name
    }]`;

    constructor(props) {
      super(props);
      this.state = {
        settings: props.settings,
      };
    }

    UNSAFE_componentWillReceiveProps(nextProps) {
      if (this.props.settings !== nextProps.settings) {
        this.setState({ settings: nextProps.settings });
      }
    }

    render() {
      return (
        <ComposedComponent
          {...this.props}
          settings={this.state.settings}
          onChange={settings => this.setState({ settings })}
          onDone={settings =>
            this.props.onChange(settings || this.state.settings)
          }
        />
      );
    }
  };

class ChartSettings extends Component {
  constructor(props) {
    super(props);
    this.state = {
      currentSection: (props.initial && props.initial.section) || null,
      currentWidget: (props.initial && props.initial.widget) || null,
    };
  }

  componentDidUpdate(prevProps) {
    const { initial } = this.props;
    if (!_.isEqual(initial, prevProps.initial)) {
      this.setState({
        currentSection: (initial && initial.section) || null,
        currentWidget: (initial && initial.widget) || null,
      });
    }
  }

  handleShowSection = section => {
    this.setState({
      currentSection: section,
      currentWidget: null,
    });
  };

  // allows a widget to temporarily replace itself with a different widget
  handleShowWidget = (widget, ref) => {
    this.setState({ popoverRef: ref, currentWidget: widget });
  };

  // go back to previously selected section
  handleEndShowWidget = () => {
    this.setState({ currentWidget: null, popoverRef: null });
  };

  handleResetSettings = () => {
    MetabaseAnalytics.trackStructEvent("Chart Settings", "Reset Settings");

    const originalCardSettings =
      this.props.dashcard.card.visualization_settings;
    const clickBehaviorSettings = getClickBehaviorSettings(this._getSettings());

    this.props.onChange({ ...originalCardSettings, ...clickBehaviorSettings });
  };

  handleChangeSettings = (changedSettings, question) => {
    this.props.onChange(
      updateSettings(this._getSettings(), changedSettings),
      question,
    );
  };

  handleChangeSeriesColor = (seriesKey, color) => {
    this.props.onChange(
      updateSeriesColor(this._getSettings(), seriesKey, color),
    );
  };

  handleDone = () => {
    this.props.onDone(this._getSettings());
    this.props.onClose();
  };

  handleCancel = () => {
    this.props.onClose();
  };

  _getSettings() {
    return (
      this.props.settings || this.props.series[0].card.visualization_settings
    );
  }

  _getComputedSettings() {
    return this.props.computedSettings || {};
  }

  _getWidgets() {
    if (this.props.widgets) {
      return this.props.widgets;
    } else {
      const { isDashboard, dashboard } = this.props;
      const transformedSeries = this._getTransformedSeries();

      return getSettingsWidgetsForSeries(
        transformedSeries,
        this.handleChangeSettings,
        isDashboard,
        { dashboardId: dashboard?.id },
      );
    }
  }

  // TODO: move this logic out of the React component
  _getRawSeries() {
    const { series } = this.props;
    const settings = this._getSettings();
    const rawSeries = assocIn(
      series,
      [0, "card", "visualization_settings"],
      settings,
    );
    return rawSeries;
  }
  _getTransformedSeries() {
    const rawSeries = this._getRawSeries();
    const { series: transformedSeries } = getVisualizationTransformed(
      extractRemappings(rawSeries),
    );
    return transformedSeries;
  }

  columnHasSettings(col) {
    const { series } = this.props;
    const settings = this._getSettings() || {};
    const settingsDefs = getSettingDefinitionsForColumn(series, col);
    const computedSettings = getComputedSettings(settingsDefs, col, settings);

    return getSettingsWidgets(
      settingsDefs,
      settings,
      computedSettings,
      col,
      _.noop,
      {
        series,
      },
    ).some(widget => !widget.hidden);
  }

  getStyleWidget = widgets => {
    const series = this._getTransformedSeries();
    const settings = this._getComputedSettings();
    const { currentWidget } = this.state;
    const seriesSettingsWidget =
      currentWidget && widgets.find(widget => widget.id === "series_settings");

    //We don't want to show series settings widget for waterfall charts
    if (series?.[0]?.card?.display === "waterfall" || !seriesSettingsWidget) {
      return null;
    }

    if (currentWidget.props?.seriesKey !== undefined) {
      return {
        ...seriesSettingsWidget,
        props: {
          ...seriesSettingsWidget.props,
          initialKey: currentWidget.props.seriesKey,
        },
      };
    } else if (currentWidget.props?.initialKey) {
      const hasBreakouts = settings["graph.dimensions"]?.length > 1;

      if (hasBreakouts) {
        return null;
      }

      const singleSeriesForColumn = series.find(single => {
        const metricColumn = single.data.cols[1];
        if (metricColumn) {
          return getColumnKey(metricColumn) === currentWidget.props.initialKey;
        }
      });

      if (singleSeriesForColumn) {
        return {
          ...seriesSettingsWidget,
          props: {
            ...seriesSettingsWidget.props,
            initialKey: keyForSingleSeries(singleSeriesForColumn),
          },
        };
      }
    }

    return null;
  };

  getFormattingWidget = widgets => {
    const { currentWidget } = this.state;
    const widget =
      currentWidget && widgets.find(widget => widget.id === currentWidget.id);

    if (widget) {
      return { ...widget, props: { ...widget.props, ...currentWidget.props } };
    }

    return null;
  };

  render() {
    const {
      className,
      question,
      addField,
      noPreview,
      dashboard,
      dashcard,
      isDashboard,
    } = this.props;
    const { popoverRef } = this.state;

    const settings = this._getSettings();
    const widgets = this._getWidgets();
    const rawSeries = this._getRawSeries();

    const widgetsById = {};
    const sections = {};

    for (const widget of widgets) {
      widgetsById[widget.id] = widget;
      if (widget.widget && !widget.hidden) {
        sections[widget.section] = sections[widget.section] || [];
        sections[widget.section].push(widget);
      }
    }

    // Move settings from the "undefined" section in the first tab
    if (sections["undefined"] && Object.values(sections).length > 1) {
      const extra = sections["undefined"];
      delete sections["undefined"];
      Object.values(sections)[0].unshift(...extra);
    }

    const sectionNames = Object.keys(sections);

    // This sorts the section radio buttons.
    const sectionSortOrder = [
      "data",
      "display",
      "axes",
      // include all section names so any forgotten sections are sorted to the end
      ...sectionNames.map(x => x.toLowerCase()),
    ];
    sectionNames.sort((a, b) => {
      const [aIdx, bIdx] = [a, b].map(x =>
        sectionSortOrder.indexOf(x.toLowerCase()),
      );
      return aIdx - bIdx;
    });

    const currentSection =
      this.state.currentSection && sections[this.state.currentSection]
        ? this.state.currentSection
        : _.find(DEFAULT_TAB_PRIORITY, name => name in sections) ||
          sectionNames[0];

    const visibleWidgets = sections[currentSection] || [];

    // This checks whether the current section contains a column settings widget
    // at the top level. If it does, we avoid hiding the section tabs and
    // overriding the sidebar title.
    const currentSectionHasColumnSettings = (
      sections[currentSection] || []
    ).some(widget => widget.id === "column_settings");

    const extraWidgetProps = {
      // NOTE: special props to support adding additional fields
      question: question,
      addField: addField,
      onShowWidget: this.handleShowWidget,
      onEndShowWidget: this.handleEndShowWidget,
      currentSectionHasColumnSettings,
      columnHasSettings: col => this.columnHasSettings(col),
      onChangeSeriesColor: (seriesKey, color) =>
        this.handleChangeSeriesColor(seriesKey, color),
    };

    const sectionPicker = (
      <SectionContainer isDashboard={isDashboard}>
        <Radio
          value={currentSection}
          onChange={this.handleShowSection}
          options={sectionNames}
          optionNameFn={v => v}
          optionValueFn={v => v}
          optionKeyFn={v => v}
          variant="underlined"
        />
      </SectionContainer>
    );

    const onReset =
      !_.isEqual(settings, {}) && (settings || {}).virtual_card == null // resetting virtual cards wipes the text and broke the UI (metabase#14644)
        ? this.handleResetSettings
        : null;

    const showSectionPicker =
      // don't show section tabs for a single section
      sectionNames.length > 1 &&
      // hide the section picker if the only widget is column_settings
      !(
        visibleWidgets.length === 1 &&
        visibleWidgets[0].id === "column_settings" &&
        // and this section doesn't doesn't have that as a direct child
        !currentSectionHasColumnSettings
      );

    // default layout with visualization
    return (
      <ChartSettingsRoot className={className}>
        <ChartSettingsMenu data-testid="chartsettings-sidebar">
          {showSectionPicker && sectionPicker}
          <ChartSettingsListContainer className={CS.scrollShow}>
            <ChartSettingsWidgetList
              widgets={visibleWidgets}
              extraWidgetProps={extraWidgetProps}
            />
          </ChartSettingsListContainer>
        </ChartSettingsMenu>
        {!noPreview && (
          <ChartSettingsPreview>
            <SectionWarnings warnings={this.state.warnings} size={20} />
            <ChartSettingsVisualizationContainer>
              <Visualization
                className={CS.spread}
                rawSeries={rawSeries}
                showTitle
                isEditing
                isDashboard
                dashboard={dashboard}
                dashcard={dashcard}
                isSettings
                showWarnings
                onUpdateVisualizationSettings={this.handleChangeSettings}
                onUpdateWarnings={warnings => this.setState({ warnings })}
              />
            </ChartSettingsVisualizationContainer>
            <ChartSettingsFooter
              onDone={this.handleDone}
              onCancel={this.handleCancel}
              onReset={onReset}
            />
          </ChartSettingsPreview>
        )}
        <ChartSettingsWidgetPopover
          anchor={popoverRef}
          widgets={[
            this.getFormattingWidget(widgets),
            this.getStyleWidget(widgets),
          ].filter(widget => !!widget)}
          handleEndShowWidget={this.handleEndShowWidget}
        />
      </ChartSettingsRoot>
    );
  }
}

const ChartSettingsFooter = ({ onDone, onCancel, onReset }) => (
  <ChartSettingsFooterRoot>
    {onReset && (
      <Button
        borderless
        icon="refresh"
        onClick={onReset}
      >{t`Reset to defaults`}</Button>
    )}
    <Button onClick={onCancel}>{t`Cancel`}</Button>
    <Button primary onClick={onDone}>{t`Done`}</Button>
  </ChartSettingsFooterRoot>
);

export default ChartSettings;

export const ChartSettingsWithState = withTransientSettingState(ChartSettings);
