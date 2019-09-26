import React from "react";
import { t } from "ttag";

import ChartSettings from "metabase/visualizations/components/ChartSettings";
import visualizations from "metabase/visualizations";
import SidebarContent from "metabase/query_builder/components/SidebarContent";

export default class ChartSettingsSidebar extends React.Component {
  state = { isSidebarTitleHidden: false };

  setIsSidebarTitleHidden = isSidebarTitleHidden =>
    this.setState({ isSidebarTitleHidden });

  render() {
    const {
      question,
      result,
      addField,
      initialChartSetting,
      onReplaceAllVisualizationSettings,
      onClose,
      onOpenChartType,
    } = this.props;
    const { isSidebarTitleHidden } = this.state;
    return (
      result && (
        <SidebarContent
          className="full-height"
          title={t`${visualizations.get(question.display()).uiName} options`}
          onDone={onClose}
          onBack={onOpenChartType}
          isTitleHidden={isSidebarTitleHidden}
        >
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
            onClose={onClose}
            noPreview
            initial={initialChartSetting}
            isSidebarTitleHidden={isSidebarTitleHidden}
            setIsSidebarTitleHidden={this.setIsSidebarTitleHidden}
          />
        </SidebarContent>
      )
    );
  }
}
