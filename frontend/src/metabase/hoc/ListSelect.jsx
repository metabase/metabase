import React from "react";

import _ from "underscore";

const keyForItem = item => `${item.type}:${item.id}`;

// Higher order component for managing selection of a list.
//
// Injects `selected` and `deselected` arrays, a `selection` set, and various
// methods to select or deselect individual or all items
//
// Composes with EntityListLoader, ListSearch, etc
const listSelect = ({ listProp = "list" } = {}) => ComposedComponent =>
  class extends React.Component {
    state = {
      selection: new Set(),
    };

    render() {
      const [selected, deselected] = _.partition(this.props[listProp], item =>
        this.state.selection.has(keyForItem(item)),
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
      const selection = new Set(this.state.selection);
      if (selected) {
        selection.add(keyForItem(item));
      } else {
        selection.delete(keyForItem(item));
      }
      this.setState({ selection });
    }

    handleSelect = item => {
      this._setSelected(item, true);
    };
    handleDeselect = item => {
      this._setSelected(item, false);
    };
    handleToggleSelected = item => {
      this._setSelected(item, !this.state.selection.has(keyForItem(item)));
    };
    handleSelectAll = () => {
      this.setState({
        selection: new Set((this.props[listProp] || []).map(keyForItem)),
      });
    };
    handleSelectNone = () => {
      this.setState({ selection: new Set() });
    };
  };

export default listSelect;
