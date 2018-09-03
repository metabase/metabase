/* @flow */
//todo rename
//todo remove {name}.css (update style using ChartSettingsTableFormatting)
import React, {Component} from "react";

import {t} from "c-3po";

import styles from './ChartSettingSummaryTableColumns.css';
import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";
import Toggle from "metabase/components/Toggle";
import {SortableContainer, SortableElement, arrayMove} from "react-sortable-hoc";

import type {ColumnName} from "metabase/meta/types/Dataset";
import {getColumnsFromSettings} from "metabase/visualizations/lib/settings/summary_table";
import type {SummaryTableSettings} from "metabase/meta/types/summary_table";


type ArrayMoveArg ={oldIndex : number, newIndex : number};

export type ColumnMetadata = {
  enabled?: boolean,
  showTotals: boolean,
  isAscSortOrder: boolean,
};


type State = {
  items : DraggableItem[],
  columnNameToMetadata : { [key: ColumnName]: ColumnMetadata },
  isChanging? : boolean
};

type StateSuperType = {
  items? : DraggableItem[],
  columnNameToMetadata? : { [key: ColumnName]: ColumnMetadata },
  isChanging? : boolean
}

type DraggableItem = {
  columnName : string,
  displayName: string,
  isDraggable : boolean
}

type Props = {
  value: SummaryTableSettings,
  columnNames: { [key: string]: string },

  onChange: ValueSerializedSupertype => void
}

type ItemTypeHelper = {
  isGroupingColumn : number => boolean,
  isColumnSourceColumn : number => boolean,
  isValueColumn : number => boolean,
  unusedSourceItemIndex : number,
  getSortableKey: number => string,
}

type ValueSerializedSupertype = {
  groupsSources?: string[],
  columnsSource?: string[],
  valuesSources?: string[],
  columnNameToMetadata?: { [key: ColumnName]: ColumnMetadata },
}


const getUnusedColumns = (settings: SummaryTableSettings, columnNames): string[] => {
  const allColumns = getColumnsFromSettings(settings);
  return Object.getOwnPropertyNames(columnNames)
    .filter(p => !allColumns.includes(p));
};


const emptyStateSerialized: SummaryTableSettings = ({
  groupsSources: [],
  columnsSource: [],
  valuesSources: [],
  columnNameToMetadata: {}
});

const convertValueToState = (stateSerialized: SummaryTableSettings, columnNames) : State => {
  const fatStateSerialized = {...emptyStateSerialized, ...stateSerialized};
  const {groupsSources, columnsSource, valuesSources, columnNameToMetadata} = fatStateSerialized;
  const unusedColumns = getUnusedColumns(fatStateSerialized, columnNames);

  const items = [ ...groupsSources.map(n => createDraggableColumn(n, columnNames[n])),
                          columnSourceItem, ...columnsSource.map(n => createDraggableColumn(n, columnNames[n])),
                          valueSourceItem, ...valuesSources.map(n => createDraggableColumn(n, columnNames[n])),
                          unusedSourceItem, ...unusedColumns.map(n => createDraggableColumn(n, columnNames[n]))];
  
  return {items, columnNameToMetadata};
};


const createDraggableColumn = (columnName: string, displayName: string) : DraggableItem => ({columnName, displayName, isDraggable : true});
const createSectionItem = (displayName: string) : DraggableItem => ({displayName, isDraggable : false, columnName:'undefined'});
const groupSourceItem : DraggableItem =createSectionItem(t`Fields to use for the table rows`);
const columnSourceItem : DraggableItem = createSectionItem(t`Field to use for the table columns`);
const valueSourceItem : DraggableItem = createSectionItem(t`Fields to use for the table values`);
const unusedSourceItem : DraggableItem = createSectionItem(t`Unused fields`);


const convertStateToValue = (state : State) : ValueSerializedSupertype => {
  const columnsPart = state.items ? convertItemsToState(state.items) : {};
  const oldMetadata = state.columnNameToMetadata || {};
  const columnNameToMetadata = state.items ? createMetadata(oldMetadata, columnsPart)  :oldMetadata;
  return {columnNameToMetadata, ...columnsPart};
};

const convertItemsToState = (items : DraggableItem[]) : ValueSerializedSupertype =>{
  const {columnSourceItemIndex, valueSourceItemIndex, unusedSourceItemIndex} = getBorderIndexes(items);
  const gs = items.slice(0, columnSourceItemIndex).map(p => p.columnName);
  const cs = items.slice(columnSourceItemIndex+1, valueSourceItemIndex).map(p => p.columnName);
  const vs = items.slice(valueSourceItemIndex+1, unusedSourceItemIndex).map(p => p.columnName);
  return {groupsSources : gs, columnsSource : cs, valuesSources: vs};
};

export default class ChartSettingSummaryTableColumns extends Component<any, Props, State> {
  state : State;

  constructor(props : Props) {
    super(props);
    this.state = convertValueToState(this.props.value, this.props.columnNames);
  }

  updateState = async (newState : StateSuperType) => {
    await this.setState(newState);
    await this.props.onChange(convertStateToValue(this.state));
  };

  componentWillReceiveProps = newProps => {
    if(newProps !== this.props)
      this.setState(convertValueToState(newProps.value, newProps.columnNames));
  };

  onSortEnd = ({oldIndex, newIndex}: ArrayMoveArg) => moveItem(this.updateState)(this.state.items, {oldIndex, newIndex});

  onSortStart = () => this.setState({isChanging : true});

  render = () => {
    const {items, isChanging, columnNameToMetadata} = this.state;
    const itemTypeHelper = getItemTypeHelper(items);
    return (
      <div>
        <div style={{fontSize: '1rem'}}><h2 className="text-bold text-paragraph mb2">{t`Customize this table`}</h2></div>
        <SectionHeader text={groupSourceItem.displayName}/>
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

  const isBorderElem = index => columnSourceItemIndex === index || valueSourceItemIndex === index || unusedSourceItemIndex === index;

  const getSortableKey = index => {
    const pref = isBorderElem(index) ? 'Border':
                 isGroupingColumn(index) ? 'Group':
                 isColumnSourceColumn(index)? 'Column':
                 isValueColumn(index)? 'Value':
                 'Unused';

    return `item-${pref}-${index}`
  };

  return {isGroupingColumn, isColumnSourceColumn, isValueColumn, unusedSourceItemIndex, getSortableKey};
};

const getBorderIndexes = (items:DraggableItem[]) => {
  const columnSourceItemIndex = items.indexOf(columnSourceItem);
  const valueSourceItemIndex = items.indexOf(valueSourceItem, columnSourceItemIndex);
  const unusedSourceItemIndex = items.indexOf(unusedSourceItem, valueSourceItemIndex);

  return {columnSourceItemIndex, valueSourceItemIndex, unusedSourceItemIndex};
};


type SortableElementArg = {
  value : DraggableItem,
  valueIndex: number,
  columnMetadata : ColumnMetadata,

  itemTypeHelper : ItemTypeHelper,


  removeItem: (number) => void,
  updateMetadata: ?ColumnName => ColumnMetadata => void,
}

const SortableItem = SortableElement(({value, valueIndex, columnMetadata , itemTypeHelper, removeItem, updateMetadata} : SortableElementArg) => {
  if(value.isDraggable) {

    const removeColumn = () => removeItem(valueIndex);
    const updateMeta = updateMetadata(value.columnName);

    if (itemTypeHelper.isGroupingColumn(valueIndex) || itemTypeHelper.isColumnSourceColumn(valueIndex))
      return <FatColumn displayName={value.displayName} columnMetadata={columnMetadata} onRemove={removeColumn}  onChange={updateMeta}/>;
    if (itemTypeHelper.isValueColumn(valueIndex))
      return <ValueColumn displayName={value.displayName} onRemove={removeColumn}/>;
    else
      return <UnusedColumn displayName={value.displayName}/>;
  }

  return <SectionHeader text={value.displayName}/>;
});

export const emptyColumnMetadata : ColumnMetadata = {showTotals : true, isAscSortOrder: true};

const SortableList = SortableContainer(({items, isChanging, updateState , itemTypeHelper, columnNameToMetadata}) => {
  const updateMetadata = updateMetadataBuilder(columnNameToMetadata, updateState);
  const removeItem = removeItemBuilder(items, updateState, itemTypeHelper);
  return (
    <ul>
      {items.map((value, index) => <SortableItem
          class='no-select' key={itemTypeHelper.getSortableKey(index)} index={index} valueIndex={index} value={value}
          disabled={!isChanging && !value.isDraggable}
          columnMetadata ={columnNameToMetadata[value.columnName] || emptyColumnMetadata}
          itemTypeHelper = {itemTypeHelper}

          updateMetadata={updateMetadata}
          removeItem={removeItem}
          />)
        }
    </ul>
  );
});

const updateMetadataBuilder = (columnNameToMetadata, updateState : StateSuperType => Promise<*>) => (columnName: ?ColumnName) => (newMetadata:ColumnMetadata) : void => {
  if(columnName)
  {
    const newColumnNameToMetadata = {...columnNameToMetadata, [columnName] : newMetadata};
    const newState = {columnNameToMetadata : newColumnNameToMetadata};
    updateState(newState);
  }
};

const removeItemBuilder = (items:DraggableItem[],updateState : StateSuperType => Promise<*>, itemTypeHelper : ItemTypeHelper) => (oldIndex:number) : void =>{
  const newIndex = itemTypeHelper.unusedSourceItemIndex ;
  moveItem(updateState)(items, {oldIndex, newIndex});
};

const moveItem = (updateState : StateSuperType => Promise<*>) => async (items: DraggableItem[], {oldIndex, newIndex} : ArrayMoveArg) : Promise<*> => {
  if(oldIndex !== newIndex){
    items = arrayMove(items, oldIndex, newIndex);

    //force: column source size <= 1
    if(items[newIndex-1] === columnSourceItem && items[newIndex+1] !== valueSourceItem)
      items = arrayMove(items, newIndex+1, newIndex+2);
    else if (items[newIndex-1] !== columnSourceItem && items[newIndex+1] === valueSourceItem )
      items = arrayMove(items, newIndex-2, newIndex-1);

    await updateState({
    items,
    isChanging : false
  });
  }
};

type FatColumnArgType = {displayName: string, columnMetadata : ColumnMetadata, onRemove: void => void, onChange: ColumnMetadata => void};
const FatColumn = ({displayName, columnMetadata , onRemove, onChange} : FatColumnArgType) =>{
  const changeOrder = (value) => onChange({...columnMetadata, isAscSortOrder: value});

    return <div className={cx("my2 bordered shadowed  cursor-pointer bg-white")}>
      <RowHeader displayName={displayName} onRemove={onRemove}/>
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

const ValueColumn = props =>
    <div className="my2 bordered shadowed cursor-pointer overflow-hidden bg-white" >
      <RowHeader {...props}/>
    </div>;




const UnusedColumn = ({displayName}) =>
    <div className="my2 bordered shadowed cursor-pointer overflow-hidden bg-white" >
      <RowHeader displayName={displayName}/>
    </div>;

const RowHeader = ({displayName, onRemove}) =>
  <div className={cx("p1 border-bottom relative bg-grey-0", !onRemove && "cursor-move")} style={{background: onRemove &&'#EDEFF0'}}>
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


const SectionHeader = ({text}) =>
<div style={{fontSize: '1rem'}}>
  <hr className={styles.charthr}/>
  <h2 className="text-bold text-paragraph mb2 no-select">{text}</h2></div>;

const createMetadata = (metadata : {}, {groupsSources, columnsSource} : ValueSerializedSupertype): {} =>{
  const names = [...groupsSources, ...columnsSource];
  return names.reduce((acc, name) => ({...acc, [name]: metadata[name] || emptyColumnMetadata}) , {});
};
