import { Component } from "react";
import { t } from "ttag";

import { fetchCardData } from "metabase/dashboard/actions";
import { PLUGIN_DATA_EDITING } from "metabase/plugins";
import type { VisualizationProps } from "metabase/visualizations/types";
import type { Card, DatasetData } from "metabase-types/api";

interface EditableTableState {
  data: DatasetData | null;
  card: Card | null;
}

const EditTableDataWithUpdate = PLUGIN_DATA_EDITING.CARD_TABLE_COMPONENT;

export class TableEditable extends Component<
  VisualizationProps,
  EditableTableState
> {
  static uiName = t`Editable Table`;
  static identifier = "table-editable";
  static iconName = "add_data";

  static disableClickBehavior = true;

  static isSensible() {
    return false;
  }

  static isLiveResizable() {
    return false;
  }

  state: EditableTableState = {
    data: null,
    card: null,
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
    const [{ card, data }] = series;
    // construct a Question that is in-sync with query results

    this.setState({
      data,
      card,
    });
  }

  handleCardDataRefresh = () => {
    const { dispatch, dashcard } = this.props;
    const { card } = this.state;

    if (!card || !dashcard) {
      return null;
    }

    return dispatch(
      fetchCardData(card, dashcard, { ignoreCache: true, reload: true }),
    );
  };

  render() {
    const { dashcard } = this.props;
    const { data, card } = this.state;

    if (!data || !card || !card.table_id || !dashcard) {
      return null;
    }

    return (
      <EditTableDataWithUpdate
        data={data}
        tableId={card.table_id}
        refetchTableDataQuery={this.handleCardDataRefresh}
      />
    );
  }
}
