import React, {Component} from "react";

import {t} from "c-3po";

import {
  columnsAreValid,
} from "metabase/visualizations/lib/utils";

import uniqueId from 'lodash/uniqueId';
import CheckBox from "metabase/components/CheckBox.jsx";
import styles from './SummaryTableColumnsSettings.css';
import Icon from "metabase/components/Icon.jsx";
import ReactSortable from "react-sortablejs";
import PropTypes from 'prop-types';

import cx from "classnames";
import Button from "metabase/components/Button";
import Toggle from "metabase/components/Toggle";


export const GROUPS_SOURCES = 'groupsSources';
const COLUMNS_SOURCE = 'columnsSource';
export const VALUES_SOURCES = 'valuesSources';
const UNUSED_COLUMNS = 'unusedColumns';

type StateSerialized = {
  [GROUPS_SOURCES]: string[],
  [COLUMNS_SOURCE]: string[],
  [VALUES_SOURCES]: string[],
  columnNameToMetadata: { [key: string]: ColumnMetadata },
}


type State = {
  [GROUPS_SOURCES]: string[],
  [COLUMNS_SOURCE]: string[],
  [VALUES_SOURCES]: string[],
  columnNameToMetadata: { [key: string]: ColumnMetadata },
  [UNUSED_COLUMNS]: string[],
};

type Props = {
  value: StateSerialized,
  columnNames: { [key: String]: String }
}

type ColumnMetadata = {
  enabled: Boolean,
  showTotals: Boolean,
  isAscSortOrder: Boolean,
};

type RowBuilder = (rowKey: String, displayName: String, clickAction: Function) => Component;


export const settingsAreValid = (settings: StateSerialized, data) =>
  settings
  && columnsAreValid(settings[COLUMNS_SOURCE] || [], data)
  && columnsAreValid(settings[GROUPS_SOURCES] || [], data)
  && columnsAreValid(settings[VALUES_SOURCES] || [], data);

const getUnusedColumns = (settings: StateSerialized, columnNames): String[] => {
  const allColumns = getColumnsFromSettings(settings);
  return Object.getOwnPropertyNames(columnNames)
    .filter(p => !allColumns.includes(p));
};

export const getColumnsFromSettings = (state: StateSerialized) => [...state[GROUPS_SOURCES] || [], ...state[COLUMNS_SOURCE] || [], ...state[VALUES_SOURCES] || []];

const emptyStateSerialized: StateSerialized = ({
  groupsSources: [],
  columnsSource: [],
  valuesSources: [],
  columnNameToMetadata: {}
});

const buildState = (stateSerialized: StateSerialized, columnNames) => {
  console.log('kkk')
  console.log(stateSerialized);
  const fatStateSerialized = {...emptyStateSerialized, ...stateSerialized};
  return {
    ...fatStateSerialized,
    [UNUSED_COLUMNS]: getUnusedColumns(fatStateSerialized, columnNames)
  }
};


function createRowHeader(displayName: String, onRemove) {
  return <div className={cx("p1 border-bottom relative bg-grey-0", !onRemove && "cursor-move")}>
    <div className="px1 flex align-center relative">
      <span className="h4 flex-full text-dark">{displayName}</span>
      {onRemove &&
        <Icon
          name="close"
          className="cursor-pointer text-grey-2 text-grey-4-hover"
          onClick={e => {
            e.stopPropagation();
            onRemove();
          }}
        />
      }
    </div>
  </div>;
}

export default class SummaryTableColumnsSetting extends Component<Props, State> {

  constructor(props) {
    super(props);
    this.state = buildState(this.props.value, this.props.columnNames)
  }

  updateState = async newState => {
    await this.setState(newState);
    this.props.onChange(this.state);

  };


  // componentWillReceiveProps(nextProps) {
  //
  //   // if(!this.state.isUpdating)
  //   // {
  //   //
  //   // }
  //   // console.log('***************')
  //   // console.log(nextProps);
  //   // console.log(this.props)
  //   // this.setState({ data: { items: [...nextProps.value] } });
  // }

  updateColumnMetadata = (columnName: string, newMetadata : ColumnMetadata) =>{
    const oldMetadata = this.getColumnMetadata(columnName);
    const mergedMetadata = {...oldMetadata, ...newMetadata};
    let newColumnsMetadata = {...this.getColumnsMetadata(), [columnName] : mergedMetadata};
    this.updateState({columnNameToMetadata:newColumnsMetadata});
  };

  getColumnMetadata = (columnName : string) : ColumnMetadata => this.getColumnsMetadata()[columnName] || {};

  getColumnsMetadata = () => this.state.columnNameToMetadata || {};

  render = () =>
    <div>
      <div style={{fontSize: '1rem'}}><h2 className="text-bold text-paragraph mb2">{t`Customize this table`}</h2></div>
      <hr className={styles.charthr}/>
      {createSortableSection(this, t`Fields to use for the table rows`, GROUPS_SOURCES, this.createFatRow)}
      <hr className={styles.charthr}/>
      {createSortableSection(this, t`Field to use for the table columns`, COLUMNS_SOURCE, this.createFatRow)}
      <hr className={styles.charthr}/>
      {createSortableSection(this, t`Fields to use for the table values`, VALUES_SOURCES, createValueSourceRow)}
      <hr className={styles.charthr}/>
      {createSortableSection(this, t`Unused fields`, UNUSED_COLUMNS, createUnusedSourceRow)}
    </div>;


  createFatRow = (rowKey: String, displayName: String, onRemove): Component => {
    const columnMetadata = this.getColumnMetadata(rowKey);
    const onChange = (value) => this.updateColumnMetadata(rowKey, {showTotals:value});
    const changeOrder = (value) => this.updateColumnMetadata(rowKey, {isAscSortOrder:value})

    console.log('metadata');
    console.log(columnMetadata);

    const content =
      <div className="my2 bordered shadowed overflow-hidden cursor-pointer bg-white">
        {createRowHeader(displayName, onRemove)}
        <div className="py1 px2 border-grey-1">
          <div className="flex align-center justify-between flex-no-shrink">
            <div className={cx(styles.DescriptionText)}>{t`Show totals`}</div>
            <Toggle value={columnMetadata.showTotals} onChange={onChange}/>
          </div>
          <div className="my1 flex align-center justify-between flex-no-shrink">
            <div className={cx(styles.DescriptionText)}>{t`Sort order`}</div>
            <div>
              <div className={cx(styles.SortOrder,
                {
                  "text-brand": columnMetadata.isAscSortOrder
                },
              )}
                   onClick={() => changeOrder(true)}>{t`Ascending`}</div>
              <div className={cx(styles.SortOrder, "pr0",
                {
                  "text-brand": !columnMetadata.isAscSortOrder
                },
              )}
                   onClick={() => changeOrder(false)}>{t`Descending`}</div>
            </div>
          </div>
        </div>
      </div>;
    return createSortableRow(rowKey, content);
  };
}

const createSortableSection = (self: SummaryTableColumnsSetting, title: String, columnsPropertyName: String, rowBuilder: RowBuilder): Component => {
  const {columnNames} = self.props;
  const rowsSource = self.state[columnsPropertyName];

  const removeRowForSource = removeColumn(self, columnsPropertyName);
  return (
    <div>
      <h4 className="mb1">{title}</h4>
      {rowsSource &&  <ReactSortable
        options={{
          animation: 150,
          group: {
            name: 'shared',
            pull: true,
            put: true
          },
        }}
        onChange={items => self.updateState({[columnsPropertyName]: items, isUpdating: !self.state.isUpdating})}

        style={{minHeight: 20}}
      >
        {rowsSource.map(name => rowBuilder(name, columnNames[name], removeRowForSource(name)))}
      </ReactSortable>}
    </div>);
};


const removeColumn = (self: SummaryTableColumnsSetting, statePropertyName: string) => (name: string) => () => {
  const rowsSource = self.state[statePropertyName];
  const unusedColumns = self.state[UNUSED_COLUMNS];
  const newState = {
    [statePropertyName]: rowsSource.filter(p => p !== name),
    [UNUSED_COLUMNS]: [name, ...unusedColumns]
  };
  self.updateState(newState);
};



//   {/*<CheckBox*/}
//   {/*checked={item.enabled}*/}
//   {/*onChange={e => this.setEnabled(i, e.target.checked)}*/}
//   {/*/>*/}
//   <span className="ml1 h4">{displayName}</span>
//   {/*<Icon*/}
//   {/*className="flex-align-right text-grey-2 mr1 cursor-pointer"*/}
//   {/*name="grabber"*/}
//   {/*width={14}*/}
//   {/*height={14}*/}
//   {/*/>*/}
// );}

const createValueSourceRow = (rowKey: String, displayName: String, onRemove): Component => {
  const content =
    <div className="my2 bordered shadowed cursor-pointer overflow-hidden bg-white">
      {createRowHeader(displayName, onRemove)}
    </div>;
  return createSortableRow(rowKey, content);
};

const createUnusedSourceRow = (rowKey: String, displayName: String): Component => {
  const content =
    <div className="my2 bordered shadowed cursor-pointer overflow-hidden bg-white">
      {createRowHeader(displayName)}
    </div>;
  return createSortableRow(rowKey, content)
};


const createSortableRow = (rowKey: String, contentComponent): Component => <div
  data-id={rowKey}
  key={rowKey}
>{contentComponent}</div>;

