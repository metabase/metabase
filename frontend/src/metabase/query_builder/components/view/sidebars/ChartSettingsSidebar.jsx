/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import ChartSettings from "metabase/visualizations/components/ChartSettings";
import visualizations from "metabase/visualizations";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import ErrorBoundary from "metabase/ErrorBoundary";

export default class ChartSettingsSidebar extends React.Component {
  state = { sidebarPropsOverride: null };

  setSidebarPropsOverride = sidebarPropsOverride =>
    this.setState({ sidebarPropsOverride });

  render() {
    const {
      question,
      result,
      addField,
      initialChartSetting,
      onReplaceAllVisualizationSettings,
      onClose,
      onOpenChartType,
      visualizationSettings,
      showSidebarTitle = false,
    } = this.props;
    const { sidebarPropsOverride } = this.state;
    const sidebarContentProps = showSidebarTitle
      ? {
          title: t`${visualizations.get(question.display()).uiName} options`,
          onBack: () => onOpenChartType(),
        }
      : {};
    return (
      result && (
        <SidebarContent
          className="full-height"
          onDone={() => onClose()}
          {...sidebarContentProps}
          {...sidebarPropsOverride}
        >
          <ErrorBoundary>
            <ChartSettings
              question={question}
              addField={addField}
              series={[
                {
                  card: question.card(),
                  data: result.data,
                },
              ]}
              onChange={onReplaceAllVisualizationSettings}
              onClose={() => onClose()}
              noPreview
              initial={initialChartSetting}
              setSidebarPropsOverride={this.setSidebarPropsOverride}
              computedSettings={visualizationSettings}
            />
          </ErrorBoundary>
        </SidebarContent>
      )
    );
  }
}
