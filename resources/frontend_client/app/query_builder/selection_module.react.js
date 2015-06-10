'use strict';

import OnClickOutside from 'react-onclickoutside';

import Icon from './icon.react';
import SearchBar from './search_bar.react';

var cx = React.addons.classSet;

export default React.createClass({
    displayName:'SelectionModule',
    propTypes: {
        action: React.PropTypes.func.isRequired,
        display: React.PropTypes.string.isRequired,
        isInitiallyOpen: React.PropTypes.bool,
        items: React.PropTypes.array,
        remove: React.PropTypes.func,
        selectedKey: React.PropTypes.string,
        selectedValue: React.PropTypes.node,
        parentIndex: React.PropTypes.number,
        placeholder: React.PropTypes.string
    },
    mixins: [OnClickOutside],

    getInitialState: function () {
        // a selection module can be told to be open on initialization but otherwise is closed
        var isInitiallyOpen = this.props.isInitiallyOpen || false;

        return {
            open: isInitiallyOpen,
            searchThreshold: 20,
            searchEnabled: false,
            filterTerm: null
        };
    },

    handleClickOutside: function() {
        this.setState({
            open: false
        });
    },

    _enableSearch: function() {
        /*
        not showing search for now
        if(this.props.items.length > this.state.searchThreshold) {
            return true
        } else {
            return false
        }
        */
        return false;
    },

    _toggleOpen: function() {
        var open = !this.state.open;
        this.setState({
            open: open
        });
    },

    _displayCustom: function(values) {
        var custom = [];
        this.props.children.forEach(function (element) {
            var newElement = element;
            newElement.props.children = values[newElement.props.content];
            custom.push(element);
        });
        return custom;
    },

    _listItems: function(selection) {
        var items,
            remove;

        if(this.props.items) {
            items = this.props.items.map(function (item, index) {
                var display = (item) ? item[this.props.display] || item : item;
                var itemClassName = cx({
                    'SelectionItem' : true,
                    'SelectionItem--selected': selection === display
                });
                // if children are provided, use the custom layout display
                return (
                    <li className={itemClassName} onClick={this._select.bind(null, item)} key={index}>
                        <Icon name='check' width="12px" height="12px" />
                        <span className="SelectionModule-display">
                            {display}
                        </span>
                    </li>
                );
            }.bind(this));
            return items;
        } else {
            return "Sorry. Something went wrong.";
        }
    },

    _select: function(item) {
        var index = this.props.index;
        // send back the item with the specified action
        if (this.props.action) {
            if (index !== undefined) {
                if (this.props.parentIndex) {
                    this.props.action(item[this.props.selectedKey], index, this.props.parentIndex);
                } else {
                    this.props.action(item[this.props.selectedKey], index);
                }
            } else {
                this.props.action(item[this.props.selectedKey]);
            }
        }
        this._toggleOpen();
    },

    render: function() {
        var selection;
        this.props.items.map(function (item) {
            if(item && item[this.props.selectedKey] === this.props.selectedValue) {
                selection = item[this.props.display];
            }
        }.bind(this));

        var placeholder = selection || this.props.placeholder,
            searchBar,
            remove,
            removeable = false;

        if(this.props.remove) {
            removeable = true;
        }

        var moduleClasses = cx({
            'SelectionModule': true,
            'relative': true,
            'selected': selection,
            'removeable': removeable
        });

        var itemListClasses = cx({
            'SelectionItems': true,
            'open' : this.state.open
        });

        if(this._enableSearch()) {
            searchBar = <SearchBar onFilter={this._filterSelections} />;
        }

        if(this.props.remove) {
            remove = (
                <div onClick={this.props.remove.bind(null, this.props.index)}>
                    <Icon name='close' className="ml2" width="12px" height="12px" />
                </div>
            );
        }

        return (
            <div className={moduleClasses}>
                <div className="SelectionModule-trigger">
                    <a className="SelectionTitle" onClick={this._toggleOpen}>
                        {placeholder}
                        {remove}
                    </a>
                </div>
                <div className={itemListClasses}>
                    {searchBar}
                    <ul className="SelectionList">
                        {this._listItems(selection)}
                    </ul>
                </div>
            </div>
        );
    }
});
