import React from "react";
import PropTypes from "prop-types";

import _ from "underscore";

const DEFAULT_KEY_FOR_ITEM = item => item.id;

// Higher order component for managing selection of a list.
//
// Expects component to be provided a `list` prop (or prop named by `listProp`)
// Injects `selected` and `deselected` arrays, a `selection` set, and various
// methods to select or deselect individual or all items
//
// Composes with EntityListLoader, ListSearch, etc
const listSelect = ({
  listProp = "list",
  keyForItem = DEFAULT_KEY_FOR_ITEM,
} = {}) => ComposedComponent =>
  class extends React.Component {
    state = {
      selectionKeys: new Set(),
    };

    static displayName =
      "ListSelect[" +
      (ComposedComponent.displayName || ComposedComponent.name) +
      "]";

    static propTypes = {
      [listProp]: PropTypes.array.isRequired,
    };

    render() {
      const [selected, deselected] = _.partition(this.props[listProp], item =>
        this.state.selectionKeys.has(keyForItem(item)),
      );
      return (
        <ComposedComponent
          {...this.props}
          selection={new Set(selected)}
          selected={selected}
          deselected={deselected}
          onSelect={this.handleSelect}
          onDeselect={this.handleDeselect}
          onToggleSelected={this.handleToggleSelected}
          onSelectAll={this.handleSelectAll}
          onSelectNone={this.handleSelectNone}
        />
      );
    }

    _setSelected(item, selected) {
      // copy so we can mutate selectionKeys
      const selectionKeys = new Set(this.state.selectionKeys);
      if (selected) {
        selectionKeys.add(keyForItem(item));
      } else {
        selectionKeys.delete(keyForItem(item));
      }
      this.setState({ selectionKeys });
    }

    handleSelect = item => {
      this._setSelected(item, true);
    };
    handleDeselect = item => {
      this._setSelected(item, false);
    };
    handleToggleSelected = item => {
      this._setSelected(item, !this.state.selectionKeys.has(keyForItem(item)));
    };
    handleSelectAll = () => {
      // set selectionKeys to key for every item in list
      this.setState({
        selectionKeys: new Set((this.props[listProp] || []).map(keyForItem)),
      });
    };
    handleSelectNone = () => {
      // reset selectionKeys
      this.setState({ selectionKeys: new Set() });
    };
  };

export default listSelect;
