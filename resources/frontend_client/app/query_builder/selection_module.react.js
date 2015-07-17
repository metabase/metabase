'use strict';
/*global _ */

import OnClickOutside from 'react-onclickoutside';

import Icon from './icon.react';
import SearchBar from './search_bar.react';

var cx = React.addons.classSet;

export default React.createClass({
    displayName:'SelectionModule',
    propTypes: {
        action: React.PropTypes.func.isRequired,
        display: React.PropTypes.string.isRequired,
        descriptionKey: React.PropTypes.string,
        expandFilter: React.PropTypes.func,
        expandTitle: React.PropTypes.string,
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
            expanded: false,
            searchThreshold: 20,
            searchEnabled: false,
            filterTerm: null
        };
    },

    handleClickOutside: function() {
        this.setState({
            open: false,
            expanded: false
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
        this.setState({
            open: !this.state.open,
            expanded: !this.state.open ? this.state.expanded : false
        });
    },

    _expand: function() {
        this.setState({
            expanded: true
        });
    },

    _isExpanded: function() {
        if (this.state.expanded || !this.props.expandFilter) {
            return true;
        }
        // if an item that is normally in the expansion is selected then show the expansion
        for (var i = 0; i < this.props.items.length; i++) {
            var item = this.props.items[i];
            if (this._itemIsSelected(item) && !this.props.expandFilter(item, i)) {
                return true;
            }
        }
        return false;
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
        if (this.props.items) {
            var sourceItems = this.props.items;

            var isExpanded = this._isExpanded();
            if (!isExpanded) {
                sourceItems = sourceItems.filter(this.props.expandFilter);
            }

            var items = sourceItems.map(function (item, index) {
                var display = (item) ? item[this.props.display] || item : item;
                var itemClassName = cx({
                    'SelectionItem' : true,
                    'SelectionItem--selected': selection === display
                });
                var description = null;
                if (this.props.descriptionKey && item && item[this.props.descriptionKey]) {
                    description = (
                        <div className="SelectionModule-description">
                            {item[this.props.descriptionKey]}
                        </div>
                    );
                }
                // if children are provided, use the custom layout display
                return (
                    <li className={itemClassName} onClick={this._select.bind(null, item)} key={index}>
                        <Icon name="check" width="12px" height="12px" />
                        <div className="flex-full">
                            <div className="SelectionModule-display">
                                {display}
                            </div>
                            {description}
                        </div>
                    </li>
                );
            }, this);

            if (!isExpanded && items.length !== this.props.items.length) {
                items.push(
                    <li className="SelectionItem border-top" onClick={this._expand} key="expand">
                        <Icon name="chevrondown" width="12px" height="12px" />
                        <div>
                            <div className="SelectionModule-display">
                                {this.props.expandedTitle || "Advanced..."}
                            </div>
                        </div>
                    </li>
                );
            }

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

    _itemIsSelected: function(item) {
        return item && _.isEqual(item[this.props.selectedKey], this.props.selectedValue);
    },

    render: function() {
        var selection;
        this.props.items.forEach(function (item) {
            if (this._itemIsSelected(item)) {
                selection = item[this.props.display];
            }
        }, this);

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
            'SelectionItems--open': this.state.open,
            'SelectionItems--expanded': this.state.expanded
        });

        if(this._enableSearch()) {
            searchBar = <SearchBar onFilter={this._filterSelections} />;
        }

        if(this.props.remove) {
            remove = (
                <a className="text-default no-decoration pr1 flex align-center" href="#" onClick={this.props.remove.bind(null, this.props.index)}>
                    <Icon name='close' width="14px" height="14px" />
                </a>
            );
        }

        return (
            <div className={moduleClasses}>
                <div className="SelectionModule-trigger flex align-center">
                    <a className="QueryOption p1 flex align-center" onClick={this._toggleOpen}>
                        {placeholder}
                    </a>
                    {remove}
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
