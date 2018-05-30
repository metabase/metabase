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


type StateSerialized = {
  groupsSources: string[],
  columnsSource: string[],
  valuesSources: string[],
  columnNameToProps: { [key: string]: ColumnProps },
}


type State = {
  groupsSources: string[],
  columnsSource: string[],
  valuesSources: string[],
  columnNameToProps: { [key: string]: ColumnProps },
  unused: string[],
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


export const settingsAreValid = (settings: StateSerialized, data) =>
  settings
  && columnsAreValid(settings.columnsSource || [], data)
  && columnsAreValid(settings.groupsSources || [], data)
  && columnsAreValid(settings.valuesSources || [], data);

const getUnusedColumns = (settings: StateSerialized, columnNames): String[] => {
  const allColumns = getColumnsFromSettings(settings);
  return Object.getOwnPropertyNames(columnNames)
    .filter(p => !allColumns.includes(p));
};

export const getColumnsFromSettings = (state: StateSerialized) => [...state.groupsSources || [], ...state.columnsSource || [], ...state.valuesSources || []];

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
    unused: getUnusedColumns(fatStateSerialized, columnNames)
  }
};


export default class SummaryTableColumnsSetting extends Component<Props, State> {

  constructor(props) {
    super(props);
    this.state = buildState(this.props.value, this.props.columnNames)
  }

  updateState = newState => {
    this.setState(newState);
    this.props.onChange({...this.state, 'unused': undefined});
  };

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



  render() {
    const {columnNames} = this.props;
    const {groupsSources, columnsSource, valuesSources, unused} = this.state;

    // const anySelected = this.isAnySelected();
    return (
      <div>
        {createSortableSection(t`Fields to use for the table rows`, groupsSources.map(name => createFatRow(name, columnNames[name], () => this.updateState({groupsSources:groupsSources.filter(p => p !== name), unused : [name,...unused]}))), items => this.updateState({groupsSources: items}))}
        {createSortableSection(t`Field to use for the table columns`, columnsSource.map(name => createFatRow(name, columnNames[name], () => this.updateState({columnsSource:columnsSource.filter(p => p !== name), unused : [name,...unused]}))), items => this.updateState({columnsSource: items}))}
        {createSortableSection(t`Fields to use for the table values`, valuesSources.map(name => createValueSourceRow(name, columnNames[name], () => this.updateState({valuesSources:valuesSources.filter(p => p !== name), unused : [name,...unused]}))), items => this.updateState({valuesSources: items}))}
        {createSortableSection(t`Unused fields`, unused.map(name => createUnusedSourceRow(name, columnNames[name])), items => this.updateState({unused: items}))}
      </div>
    );
  }
}

const createSortableSection = (title: String, rows: Component[], updateStateFunc: (string[] => (void))): Component =>
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
      onChange={updateStateFunc}

      style={{minHeight: 20}}
    >
      {rows}
    </ReactSortable>
  </div>
;


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

