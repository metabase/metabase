import React, {Component} from "react";

import {t} from "c-3po";

import {
  columnsAreValid,
} from "metabase/visualizations/lib/utils";

import uniqueId from 'lodash/uniqueId';
import CheckBox from "metabase/components/CheckBox.jsx";
import Icon from "metabase/components/Icon.jsx";
import ReactSortable from "react-sortablejs";
import PropTypes from 'prop-types';

import cx from "classnames";
import Button from "metabase/components/Button";


const GROUPS_SOURCES = 'groupsSources';
const COLUMNS_SOURCE = 'columnsSource';
const VALUES_SOURCES = 'valuesSources';
const UNUSED_COLUMNS = 'unusedColumns';

type StateSerialized = {
  [GROUPS_SOURCES]: string[],
  [COLUMNS_SOURCE]: string[],
  [VALUES_SOURCES]: string[],
  columnNameToProps: { [key: string]: ColumnProps },
}


type State = {
  [GROUPS_SOURCES]: string[],
  [COLUMNS_SOURCE]: string[],
  [VALUES_SOURCES]: string[],
  columnNameToProps: { [key: string]: ColumnProps },
  [UNUSED_COLUMNS]: string[],
};

type Props = {
  value: StateSerialized,
  columnNames: { [key: String]: String }
}

type ColumnProps = {
  enabled: Boolean,
  showTotals: Boolean,
  //todo:
  sortOrder: any,
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
  columnNameToProps: {}
});

const buildState = (stateSerialized: StateSerialized, columnNames) => {
  const fatStateSerialized = {...emptyStateSerialized, ...stateSerialized};
  return {
    ...fatStateSerialized,
    [UNUSED_COLUMNS]: getUnusedColumns(fatStateSerialized, columnNames)
  }
};


export default class SummaryTableColumnsSetting extends Component<Props, State> {

  constructor(props) {
    super(props);
    this.state = buildState(this.props.value, this.props.columnNames)
  }

  updateState = newState => {
    this.setState(newState);
    // if(!newState.isUpdating)
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

  // shouldUpdate = (newState: UnboxedState) => {
  //   // if(newState.columnsSource.)
  // }


  // setEnabled = (index, checked) => {
  //   const items = [...this.state.data.items];
  //   items[index] = { ...items[index], enabled: checked };
  //   this.setState({ data: { items } });
  //   this.props.onChange([...items]);
  // };

  // isAnySelected = () => {
  //   let selected = false;
  //   for (const item of [...this.state.data.items]) {
  //     if (item.enabled) {
  //       selected = true;
  //       break;
  //     }
  //   }
  //   return selected;
  // };

  // toggleAll = anySelected => {
  //   const items = [...this.state.data.items].map(item => ({
  //     ...item,
  //     enabled: !anySelected,
  //   }));
  //   this.setState({ data: { items } });
  //   this.props.onChange([...items]);
  // };

  // updateState = (sta) =>{
  //   console.log(sta);
  //   this.setState(sta);
  //   console.log(this.state);
  // };



  render = () =>
      <div>
        {createSortableSection(this, t`Fields to use for the table rows`, GROUPS_SOURCES, createFatRow)}
        {createSortableSection(this, t`Field to use for the table columns`, COLUMNS_SOURCE, createFatRow)}
        {createSortableSection(this, t`Fields to use for the table values`, VALUES_SOURCES, createValueSourceRow)}
        {createSortableSection(this, t`Unused fields`, UNUSED_COLUMNS, createUnusedSourceRow)}
      </div>;

}

const createSortableSection = (self: SummaryTableColumnsSetting ,title: String, columnsPropertyName: String, rowBuilder : RowBuilder): Component => {
  const {columnNames} = self.props;
  const rowsSource = self.state[columnsPropertyName];

  const removeRowForSource =  removeColumn(self, columnsPropertyName);

  return (
  <div>
    <h4 className="mb1">{title}</h4>
    <ReactSortable
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
    </ReactSortable>
  </div>);
};


const removeColumn = (self: SummaryTableColumnsSetting, statePropertyName :string) => (name: string) => () =>{
  const rowsSource = self.state[statePropertyName];
  const unusedColumns = self.state[UNUSED_COLUMNS];
  const newState ={[statePropertyName]:rowsSource.filter(p => p !== name), [UNUSED_COLUMNS] : [name,...unusedColumns]};
  self.updateState(newState);
};



const createFatRow = (rowKey: String, displayName: String, clickAction): Component => {
  const content = <div style={{display: 'flex'}}><span className="ml1 h4">{displayName}</span>
    {createCloseButton(clickAction)}
  </div>;
  return createSortableRow(rowKey, content)
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

const createValueSourceRow = (rowKey: String, displayName: String,clickAction): Component => {
  const content = <div style={{display: 'flex'}}><span className="ml1 h4">{displayName}</span>{createCloseButton(clickAction)}
  </div>;
  return createSortableRow(rowKey, content)
};

const createCloseButton = (clickAction) => <Button style={{'margin-left': 'auto'}} icon='close' onlyIcon='true' onClick={clickAction}/>;

const createUnusedSourceRow = (rowKey: String, displayName: String): Component => {
  const content = <span className="ml1 h4">{displayName}</span>;
  return createSortableRow(rowKey, content)
};


const createSortableRow = (rowKey: String, contentComponent): Component => <div
  data-id={rowKey}
  key={rowKey}
>{contentComponent}</div>;

