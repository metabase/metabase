/* @flow */
//todo clean imports and package.json
import React, {Component} from "react";

import {t} from "c-3po";

import {
  columnsAreValid,
} from "metabase/visualizations/lib/utils";

import CheckBox from "metabase/components/CheckBox.jsx";
import styles from './SummaryTableColumnsSettings.css';
import Icon from "metabase/components/Icon.jsx";
import PropTypes from 'prop-types';

import cx from "classnames";
import Button from "metabase/components/Button";
import Toggle from "metabase/components/Toggle";
import {SortableContainer, SortableElement, arrayMove} from "react-sortable-hoc";


//todo: remove consts
export const GROUPS_SOURCES = 'groupsSources';
export const COLUMNS_SOURCE = 'columnsSource';
export const VALUES_SOURCES = 'valuesSources';
const UNUSED_COLUMNS = 'unusedColumns';

type ValueSerialized = {
  [GROUPS_SOURCES]: string[],
  [COLUMNS_SOURCE]: string,
  [VALUES_SOURCES]: string[],
  columnNameToMetadata: { [key: ColumnName]: ColumnMetadata },
}

type ColumnMetadata = {
  enabled: Boolean,
  showTotals: Boolean,
  isAscSortOrder: Boolean,
};

type ColumnName = string;

type State = {
  items : DraggableItem[],
  columnNameToMetadata: { [key: ColumnName]: ColumnMetadata },
  isChanging : Boolean
};

type DraggableItem = {
  name : string,
  displayName: String,
  isDraggable : boolean
}

type Props = {
  value: ValueSerialized,
  columnNames: { [key: String]: String }
}

type ItemTypeHelper = {
  isGroupingColumn : Number => Boolean,
  isColumnSourceColumn : Number => Boolean,
  isValueColumn : Number => Boolean,
  unusedSourceItemIndex : Number,
}


export const settingsAreValid = (settings: ValueSerialized, data) =>
  settings
  && (!settings[COLUMNS_SOURCE] || columnsAreValid([settings[COLUMNS_SOURCE]], data))
  && columnsAreValid(settings[GROUPS_SOURCES] || [], data)
  && columnsAreValid(settings[VALUES_SOURCES] || [], data);


const getUnusedColumns = (settings: ValueSerialized, columnNames): String[] => {
  const allColumns = getColumnsFromSettings(settings);
  return Object.getOwnPropertyNames(columnNames)
    .filter(p => !allColumns.includes(p));
};

export const getColumnsFromSettings = (state: ValueSerialized) => [...state[GROUPS_SOURCES] || [], ...(state[COLUMNS_SOURCE] ? [state[COLUMNS_SOURCE]] : []), ...state[VALUES_SOURCES] || []];

const emptyStateSerialized: ValueSerialized = ({
  groupsSources: [],
  columnsSource: undefined,
  valuesSources: [],
  columnNameToMetadata: {}
});

const convertValueToState = (stateSerialized: ValueSerialized, columnNames) : State => {
  const fatStateSerialized = {...emptyStateSerialized, ...stateSerialized};
  //todo
  const {groupsSources, columnsSource, valuesSources, columnNameToMetadata} = fatStateSerialized;
  const unusedColumns = getUnusedColumns(fatStateSerialized, columnNames);
  const columnSoureArray = columnsSource ? [columnsSource] : [];

  const items = [ ...groupsSources.map(n => createDraggableColumn(n, columnNames[n])),
                          columnSourceItem, ...columnSoureArray.map(n => createDraggableColumn(n, columnNames[n])),
                          valueSourceItem, ...valuesSources.map(n => createDraggableColumn(n, columnNames[n])),
                          unusedSourceItem, ...unusedColumns.map(n => createDraggableColumn(n, columnNames[n]))];

  return {items, columnNameToMetadata};
};


const createDraggableColumn = (name: String, displayName: String) : DraggableItem => ({name, displayName, isDraggable : true});
const createSectionItem = (displayName: String) : DraggableItem => ({displayName, isDraggable : false});
const groupSourceItem : DraggableItem =createSectionItem(t`Fields to use for the table rows`);
const columnSourceItem : DraggableItem = createSectionItem(t`Field to use for the table columns`);
const valueSourceItem : DraggableItem = createSectionItem(t`Fields to use for the table values`);
const unusedSourceItem : DraggableItem = createSectionItem(t`Unused fields`);


const convertStateToValue = (state : State) : ValueSerialized => {

  const metadataPart = state.columnNameToMetadata ? {columnNameToMetadata : state.columnNameToMetadata} : {};
  const columnsPart = state.items ? convertItemsToState(state.items) : {};

  return {...metadataPart, ...columnsPart};
};

const convertItemsToState = (items : DraggableItem[]) =>{
  const {columnSourceItemIndex, valueSourceItemIndex, unusedSourceItemIndex} = getBorderIndexes(items);
  const gs = items.slice(0, columnSourceItemIndex).map(p => p.name);
  const cs = items.slice(columnSourceItemIndex+1, valueSourceItemIndex).map(p => p.name);
  const vs = items.slice(valueSourceItemIndex+1, unusedSourceItemIndex).map(p => p.name);
  return {[GROUPS_SOURCES] : gs, [COLUMNS_SOURCE] : cs[0], [VALUES_SOURCES]: vs};
};


export default class SummaryTableColumnsSetting extends Component<Props, State> {

  constructor(props) {
    super(props);
    this.state = convertValueToState(this.props.value, this.props.columnNames)
  }

  updateState = async newState => {
    await this.setState(newState);
    await this.props.onChange(convertStateToValue(this.state));
  };

  onSortEnd = ({oldIndex, newIndex}) => moveItem(this.updateState)(this.state.items, {oldIndex, newIndex});

  onSortStart = () => this.setState({isChanging : true});

  render = () => {
    const {items, isChanging, columnNameToMetadata} = this.state;
    const itemTypeHelper = getItemTypeHelper(items);
    return (
      <div>
        <div style={{fontSize: '1rem'}}><h2 className="text-bold text-paragraph mb2">{t`Customize this table`}</h2></div>
        {SectionHeader(groupSourceItem.displayName)}
        <SortableList items={items} onSortEnd={this.onSortEnd} onSortStart={this.onSortStart} hideSortableGhost={true}  isChanging={isChanging} itemTypeHelper={itemTypeHelper} updateState={this.updateState}
                      columnNameToMetadata={columnNameToMetadata}
                      distance={10}
                      helperClass="z5" />
      </div>)};


}

const getItemTypeHelper = (items:DraggableItem[]):ItemTypeHelper => {
  const {columnSourceItemIndex, valueSourceItemIndex, unusedSourceItemIndex} = getBorderIndexes(items);
  const isGroupingColumn = index => index < columnSourceItemIndex;
  const isColumnSourceColumn = index => columnSourceItemIndex < index && index < valueSourceItemIndex;
  const isValueColumn = index =>valueSourceItemIndex < index && index < unusedSourceItemIndex;
  return {isGroupingColumn, isColumnSourceColumn, isValueColumn, unusedSourceItemIndex};
};

const getBorderIndexes = (items:DraggableItem[]) => {
  const columnSourceItemIndex = items.indexOf(columnSourceItem);
  const valueSourceItemIndex = items.indexOf(valueSourceItem, columnSourceItemIndex);
  const unusedSourceItemIndex = items.indexOf(unusedSourceItem, valueSourceItemIndex);

  return {columnSourceItemIndex, valueSourceItemIndex, unusedSourceItemIndex};
};


type SortableElementArg = {
  value : DraggableItem,
  valueIndex: Number,
  columnMetadata : ColumnMetadata,

  itemTypeHelper : ItemTypeHelper,


  removeItem: (Number) => void,
  updateMetadata: ColumnName => ColumnMetadata => void,
}

const SortableItem = SortableElement(({value, valueIndex, columnMetadata , itemTypeHelper, removeItem, updateMetadata} : SortableElementArg) => {
  if(value.isDraggable) {

    const removeColumn = () => removeItem(valueIndex);
    const updateMeta = updateMetadata(value.name);

    if (itemTypeHelper.isGroupingColumn(valueIndex))
      return FatColumn(value.displayName, columnMetadata, removeColumn, updateMeta);
    if (itemTypeHelper.isColumnSourceColumn(valueIndex))
      return FatColumn(value.displayName, columnMetadata, removeColumn, updateMeta);
    if (itemTypeHelper.isValueColumn(valueIndex))
      return ValueColumn(value.displayName, removeColumn);
    else
      return UnusedColumn(value.displayName);
  }

  return SectionHeader(value.displayName);
});

const emptyColumnMetadata : ColumnMetadata = {showTotals : true};

const SortableList = SortableContainer(({items, isChanging, updateState , itemTypeHelper, columnNameToMetadata}) => {
  const updateMetadata = updateMetadataBuilder(columnNameToMetadata, updateState);
  const removeItem = removeItemBuilder(items, updateState, itemTypeHelper);
  return (
    <ul>
      {items.map((value, index) => <SortableItem
          class='no-select' key={`item-${index}`} index={index} valueIndex={index} value={value}
          disabled={!isChanging && !value.isDraggable}
          columnMetadata ={columnNameToMetadata[value.name] || emptyColumnMetadata}
          itemTypeHelper = {itemTypeHelper}

          updateMetadata={updateMetadata}
          removeItem={removeItem}
          />)
        }
    </ul>
  );
});

const updateMetadataBuilder = (columnNameToMetadata, updateState : State => void) => (columnName: ColumnName) => (newMetadata:ColumnMetadata) : void => {
    const newColumnNameToMetadata = {...columnNameToMetadata, [columnName] : newMetadata};
    const newState = {columnNameToMetadata : newColumnNameToMetadata};
    updateState(newState);
};

const removeItemBuilder = (items:DraggableItem[],updateState : State => void, itemTypeHelper : ItemTypeHelper) => (oldIndex:Number) : void =>{
  const newIndex = itemTypeHelper.unusedSourceItemIndex ;
  moveItem(updateState)(items, {oldIndex, newIndex});
};

const moveItem = (updateState : State => void) => (items: DraggableItem[], {oldIndex, newIndex}) => {
  if(oldIndex !== newIndex)
  updateState({
    items: arrayMove(items, oldIndex, newIndex),
    isChanging : false
  });
};


const FatColumn = (displayName: String, columnMetadata : ColumnMetadata, onRemove: void => void, onChange: ColumnMetadata => void): Component =>{
  const changeOrder = (value) => onChange({...columnMetadata, isAscSortOrder: value});

    return <div className={cx("my2 bordered shadowed  cursor-pointer bg-white")}>
      {RowHeader(displayName, onRemove)}
      <div className="py1 px2 border-grey-1">
        <div className="flex align-center justify-between flex-no-shrink">
          <div className={cx(styles.DescriptionText)}>{t`Show totals`}</div>
          <Toggle value={columnMetadata.showTotals === true} onChange={() => onChange({...columnMetadata, showTotals: !columnMetadata.showTotals})}/>
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
    </div>;};

const ValueColumn = (displayName: String, onRemove: void => void): Component =>
    <div className="my2 bordered shadowed cursor-pointer overflow-hidden bg-white" >
      {RowHeader(displayName, onRemove)}
    </div>;




const UnusedColumn = (displayName: String): Component =>
    <div className="my2 bordered shadowed cursor-pointer overflow-hidden bg-white" >
      {RowHeader(displayName)}
    </div>;


const RowHeader = (displayName: String, onRemove) => <div className={cx("p1 border-bottom relative bg-grey-0", !onRemove && "cursor-move")}>
    <div className="px1 flex align-center relative">
      <span className="h4 flex-full text-dark no-select">{displayName}</span>
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


const SectionHeader = text =>
<div style={{fontSize: '1rem'}}>
  <hr className={styles.charthr}/>
  <h2 className="text-bold text-paragraph mb2 no-select">{text}</h2></div>;
