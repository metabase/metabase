/* @flow */
/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";

import Item from "./Item";

import S from "./List.css";

// $FlowFixMe: react-virtualized ignored
import { List as VirtalizedList, WindowScroller } from "react-virtualized";
import "react-virtualized/styles.css";

const HORIZONTAL_PADDING = 32;
const ROW_HEIGHT = 87;

import type { Item as ItemType, Entity } from "../types";

type Props = {
  items: ItemType[],

  editable: boolean,
  showCollectionName: boolean,

  setItemSelected: (selected: { [key: number]: boolean }) => void,
  setFavorited: (id: number, favorited: boolean) => void,
  setArchived: (id: number, archived: boolean, undoable: boolean) => void,
  onEntityClick: (entity: Entity) => void,
};

type ReactVirtualizedRowRendererProps = {
  index: number,
  key: string,
  style: { [key: string]: any },
};

export default class List extends React.Component {
  props: Props;

  _list: ?React.Element<VirtalizedList>;

  static propTypes = {
    items: PropTypes.array.isRequired,

    editable: PropTypes.bool,
    showCollectionName: PropTypes.bool.isRequired,

    setItemSelected: PropTypes.func.isRequired,
    setFavorited: PropTypes.func.isRequired,
    setArchived: PropTypes.func.isRequired,
    onEntityClick: PropTypes.func,
  };

  renderRow = ({ index, key, style }: ReactVirtualizedRowRendererProps) => {
    const {
      editable,
      setItemSelected,
      setFavorited,
      setArchived,
      onEntityClick,
      showCollectionName,
      items,
    } = this.props;
    const item = items[index];
    return (
      <div
        key={key}
        style={{ ...style, display: item.visible ? undefined : "none" }}
      >
        <Item
          setItemSelected={editable ? setItemSelected : null}
          setFavorited={editable ? setFavorited : null}
          setArchived={editable ? setArchived : null}
          onEntityClick={onEntityClick}
          showCollectionName={showCollectionName}
          {...item}
        />
      </div>
    );
  };

  render() {
    let { items } = this.props;

    return (
      <WindowScroller>
        {({ height, width, isScrolling, registerChild, scrollTop }) => (
          <div ref={registerChild}>
            <VirtalizedList
              ref={l => (this._list = l)}
              className={S.list}
              autoHeight
              height={height}
              isScrolling={isScrolling}
              rowCount={items.length}
              rowHeight={ROW_HEIGHT}
              rowRenderer={this.renderRow}
              scrollTop={scrollTop}
              width={width - HORIZONTAL_PADDING * 2}
            />
          </div>
        )}
      </WindowScroller>
    );
  }
}
