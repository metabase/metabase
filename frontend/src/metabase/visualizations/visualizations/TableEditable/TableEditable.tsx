import { Component } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { PLUGIN_DATA_EDITING } from "metabase/plugins";
import { Flex, Title } from "metabase/ui";
import LoadingView from "metabase/visualizations/components/Visualization/LoadingView";
import type { VisualizationProps } from "metabase/visualizations/types";
import Question from "metabase-lib/v1/Question";
import type { Card, DatasetData } from "metabase-types/api";

import { mergeSettings } from "../../lib/settings/typed-utils";

import { TableEditableConfigureActionButton } from "./TableEditableConfigureActionButton";

interface EditableTableState {
  data: DatasetData | null;
  card: Card | null;
  question: Question | null;
}

const EditTableDashcardVisualization = PLUGIN_DATA_EDITING.CARD_TABLE_COMPONENT;

export class TableEditable extends Component<
  VisualizationProps,
  EditableTableState
> {
  static getUiName = () => t`Editable Table`;
  static identifier = "table-editable";
  static iconName = "add_data";

  static disableClickBehavior = true;
  static supportsSeries = false;
  static disableReplaceCard = true;
  static disableSettingsConfig = true;
  static disableNavigateToNewCardFromDashboard = true;
  static noHeader = true;
  static noResults = true;

  static additionalDashcardActionButtons = [TableEditableConfigureActionButton];

  static isSensible() {
    return false;
  }

  static isLiveResizable() {
    return false;
  }

  static defaultSize = {
    width: 24,
    height: 8,
  };

  state: EditableTableState = {
    data: null,
    card: null,
    question: null,
  };

  UNSAFE_componentWillMount() {
    this._updateState(this.props);
  }

  UNSAFE_componentWillReceiveProps(newProps: VisualizationProps) {
    if (newProps.series !== this.props.series) {
      this._updateState(newProps);
    }
  }

  _updateState({ series }: VisualizationProps) {
    const { metadata } = this.props;
    const [{ card, data }] = series;

    const question = new Question(card, metadata);

    this.setState({
      data,
      card,
      question,
    });
  }

  render() {
    const { dashcard, className, metadata } = this.props;
    const { data, card, question } = this.state;

    if (card?.visualization_settings?.table_id && !data && dashcard?.isAdded) {
      // use case for just added and not yet saved table card
      const tableId = card?.visualization_settings?.table_id;
      const table = metadata?.table(tableId);

      return (
        <Flex align="center" justify="center" h="100%">
          <div>
            <Title className={CS.textCentered} p="md" order={2}>
              {table?.display_name}
            </Title>
            <Title p="md" order={4}>
              {t`This editable table will be populated after this dashboard is saved`}
            </Title>
          </div>
        </Flex>
      );
    }

    if (!card || !card.table_id || !dashcard || !question) {
      return null;
    }

    if (!data) {
      return <LoadingView isSlow={false} />;
    }

    const visualizationSettings = mergeSettings(
      card.visualization_settings,
      dashcard.visualization_settings,
    );

    // This is a potential bottleneck, however there's no straightforward optimization inside a class component
    // However based on props and state configuration it shouldn't be a problem for now
    const hasVisibleColumns =
      !visualizationSettings?.["table.columns"] ||
      visualizationSettings?.["table.columns"].some((column) => column.enabled);

    if (!hasVisibleColumns) {
      return (
        <Flex align="center" justify="center" h="100%">
          <Title p="md" order={2}>
            {t`No results!`}
          </Title>
        </Flex>
      );
    }

    return (
      <EditTableDashcardVisualization
        title={card.name}
        dashcardId={dashcard.id}
        cardId={card.id}
        className={className}
        data={data}
        tableId={card.table_id}
        visualizationSettings={visualizationSettings}
        question={question}
      />
    );
  }
}
