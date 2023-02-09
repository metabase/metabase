/* eslint-disable react/prop-types */
import React, { Component } from "react";
import cx from "classnames";
import { assocIn } from "icepick";
import _ from "underscore";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import Radio from "metabase/core/components/Radio";

import Visualization from "metabase/visualizations/components/Visualization";

import { getSettingsWidgetsForSeries } from "metabase/visualizations/lib/settings/visualization";
import { updateSeriesColor } from "metabase/visualizations/lib/series";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import {
  getVisualizationTransformed,
  extractRemappings,
} from "metabase/visualizations";
import {
  updateSettings,
  getClickBehaviorSettings,
  getComputedSettings,
  getSettingsWidgets,
} from "metabase/visualizations/lib/settings";

import { keyForSingleSeries } from "metabase/visualizations/lib/settings/series";
import { getSettingDefinitionsForColumn } from "metabase/visualizations/lib/settings/column";
import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";

import ChartSettingsWidgetList from "./ChartSettingsWidgetList";
import ChartSettingsWidgetPopover from "./ChartSettingsWidgetPopover";
import {
  SectionContainer,
  SectionWarnings,
  TitleButton,
} from "./ChartSettings.styled";

// section names are localized
const DEFAULT_TAB_PRIORITY = [t`Data`];

const withTransientSettingState = ComposedComponent =>
  class extends React.Component {
    static displayName = `withTransientSettingState[${
      ComposedComponent.displayName || ComposedComponent.name
    }]`;

    constructor(props) {
      super(props);
      this.state = {
        settings: props.settings,
        overrideProps: {},
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
          setSidebarPropsOverride={overrideProps =>
            this.setState({ overrideProps })
          }
          {...this.state.overrideProps}
        />
      );
    }
  };

class ChartSettings extends Component {
  constructor(props) {
    super(props);
    this.state = {
      currentSection: (props.initial && props.initial.section) || null,
      popoverWidget: (props.initial && props.initial.widget) || null,
    };
  }

  componentDidUpdate(prevProps) {
    const { initial } = this.props;
    if (!_.isEqual(initial, prevProps.initial)) {
      this.setState({
        currentSection: (initial && initial.section) || null,
        popoverWidget: (initial && initial.widget) || null,
      });
    }
  }

  handleShowSection = section => {
    this.setState({ currentSection: section, popoverWidget: null });
  };

  // allows a widget to temporarily replace itself with a different widget
  handleShowPopoverWidget = (widget, ref) => {
    this.setState({ popoverRef: ref, popoverWidget: widget });
  };

  handleSetCurrentWidget = (widget, title) => {
    this.props.setSidebarPropsOverride({
      title: title,
      onBack: () => {
        this.handleEndShowWidget();
        this.props.setSidebarPropsOverride({});
      },
    });
    this.setState({ currentWidget: widget });
  };

  // go back to previously selected section
  handleEndShowWidget = () => {
    this.setState({
      popoverWidget: null,
      popoverRef: null,
      currentWidget: null,
    });
  };

  handleResetSettings = () => {
    MetabaseAnalytics.trackStructEvent("Chart Settings", "Reset Settings");

    const settings = getClickBehaviorSettings(this._getSettings());
    this.props.onChange(settings);
  };

  handleChangeSettings = changedSettings => {
    this.props.onChange(updateSettings(this._getSettings(), changedSettings));
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
      const { isDashboard, metadata, isQueryRunning = false } = this.props;
      const transformedSeries = this._getTransformedSeries();

      return getSettingsWidgetsForSeries(
        transformedSeries,
        this.handleChangeSettings,
        isDashboard,
        { metadata, isQueryRunning },
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

  getStyleWidget = () => {
    const widgets = this._getWidgets();
    const series = this._getTransformedSeries();
    const settings = this._getComputedSettings();
    const { popoverWidget } = this.state;
    const seriesSettingsWidget =
      popoverWidget && widgets.find(widget => widget.id === "series_settings");

    //We don't want to show series settings widget for waterfall charts
    if (series?.[0]?.card?.display === "waterfall" || !seriesSettingsWidget) {
      return null;
    }

    if (popoverWidget.props?.seriesKey !== undefined) {
      return {
        ...seriesSettingsWidget,
        props: {
          ...seriesSettingsWidget.props,
          initialKey: popoverWidget.props.seriesKey,
        },
      };
    } else if (popoverWidget.props?.initialKey) {
      const hasBreakouts = settings["graph.dimensions"]?.length > 1;

      if (hasBreakouts) {
        return null;
      }

      const singleSeriesForColumn = series.find(single => {
        const metricColumn = single.data.cols[1];
        if (metricColumn) {
          return getColumnKey(metricColumn) === popoverWidget.props.initialKey;
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

  getFormattingWidget = () => {
    const widgets = this._getWidgets();
    const { popoverWidget } = this.state;
    const widget =
      popoverWidget && widgets.find(widget => widget.id === popoverWidget.id);

    if (widget) {
      return { ...widget, props: { ...widget.props, ...popoverWidget.props } };
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
      title,
      onBack,
    } = this.props;
    const { popoverWidget, popoverRef, currentWidget } = this.state;

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

    const visibleWidgets =
      (currentWidget
        ? [
            widgets.find(
              widget => widget.id === currentWidget.props.initialKey,
            ),
          ].map(w => ({ ...w, hidden: false }))
        : sections[currentSection]) || [];

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
      onShowPopoverWidget: this.handleShowPopoverWidget,
      onSetCurrentWidget: this.handleSetCurrentWidget,
      onEndShowWidget: this.handleEndShowWidget,
      currentSectionHasColumnSettings,
      columnHasSettings: col => this.columnHasSettings(col),
      onChangeSeriesColor: (seriesKey, color) =>
        this.handleChangeSeriesColor(seriesKey, color),
    };

    const sectionPicker = (
      <SectionContainer>
        <Radio
          value={currentSection}
          onChange={this.handleShowSection}
          options={sectionNames}
          optionNameFn={v => v}
          optionValueFn={v => v}
          optionKeyFn={v => v}
          variant="bubble"
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
      ) &&
      !currentWidget;

    // default layout with visualization
    return (
      <div className={cx(className, "flex flex-column")}>
        {showSectionPicker && (
          <div
            className={cx("flex flex-no-shrink pl4 pb1", {
              pt3: isDashboard,
            })}
          >
            {sectionPicker}
          </div>
        )}
        {noPreview ? (
          <div className="full-height relative scroll-y scroll-show pt2 pb4">
            <ChartSettingsWidgetList
              widgets={visibleWidgets}
              extraWidgetProps={extraWidgetProps}
            />
          </div>
        ) : (
          <div className="Grid flex-full">
            <div
              className="Grid-cell Cell--1of3 scroll-y scroll-show border-right py4"
              data-testid="chartsettings-sidebar"
            >
              {title && (
                <TitleButton onClick={onBack} icon="chevronleft" onlyText>
                  {title}
                </TitleButton>
              )}
              <ChartSettingsWidgetList
                widgets={visibleWidgets}
                extraWidgetProps={extraWidgetProps}
              />
            </div>
            <div className="Grid-cell flex flex-column pt2">
              <div className="mx4 flex flex-column">
                <SectionWarnings
                  className="mx2 align-self-end"
                  warnings={this.state.warnings}
                  size={20}
                />
              </div>
              <div className="mx4 flex-full relative">
                <Visualization
                  className="spread"
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
              </div>
              <ChartSettingsFooter
                onDone={this.handleDone}
                onCancel={this.handleCancel}
                onReset={onReset}
              />
            </div>
          </div>
        )}
        <ChartSettingsWidgetPopover
          currentWidgetKey={
            popoverWidget?.props?.initialKey || popoverWidget?.props?.seriesKey
          }
          anchor={popoverRef}
          widgets={[this.getFormattingWidget(), this.getStyleWidget()].filter(
            widget => !!widget,
          )}
          handleEndShowWidget={this.handleEndShowWidget}
        />
      </div>
    );
  }
}

const ChartSettingsFooter = ({ className, onDone, onCancel, onReset }) => (
  <div className={cx("py2 px4", className)}>
    <div className="float-right">
      <Button
        className="ml2"
        onClick={onCancel}
        data-metabase-event="Chart Settings;Cancel"
      >{t`Cancel`}</Button>
      <Button
        primary
        className="ml2"
        onClick={onDone}
        data-metabase-event="Chart Settings;Done"
      >{t`Done`}</Button>
    </div>

    {onReset && (
      <Button
        borderless
        icon="refresh"
        className="float-right ml2"
        data-metabase-event="Chart Settings;Reset"
        onClick={onReset}
      >{t`Reset to defaults`}</Button>
    )}
  </div>
);

export default ChartSettings;

export const ChartSettingsWithState = withTransientSettingState(ChartSettings);
