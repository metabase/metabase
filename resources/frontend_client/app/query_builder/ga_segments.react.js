'use strict';
/*global _ */

import OnClickOutside from 'react-onclickoutside';

import Icon from './icon.react';
import SearchBar from './search_bar.react';

var cx = React.addons.classSet;

export default React.createClass({
    displayName:'GASegmentList',
    propTypes: {
        fields: React.PropTypes.array.isRequired
    },
    mixins: [OnClickOutside],

    getInitialState: function () {
        // a selection module can be told to be open on initialization but otherwise is closed
        var isInitiallyOpen = this.props.isInitiallyOpen || false;

        return {
            open: isInitiallyOpen,
            expanded: false,
            searchThreshold: 20,
            searchEnabled: true,
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

    _listDimensions: function(selection) {
        if (this.props.fields) {
            var sourceItems = this.props.fields;

            var isExpanded = this._isExpanded();
            if (!isExpanded) {
                sourceItems = sourceItems.filter(this.props.expandFilter);
            }

            var items = sourceItems.map(function (item, index) {
                var itemClassName = cx({
                    'SelectionItem' : true,
                });
                var description = (
                    <div className="SelectionModule-description">
                        {item.id}
                    </div>
                );
                // if children are provided, use the custom layout display
                return (
                    <li className={itemClassName} onClick={this._select.bind(null, item)} key={index}>
                        <Icon name="check" width="12px" height="12px" />
                        <div className="flex-full">
                            <div className="SelectionModule-display">
                                {item.name}
                            </div>
                            {description}
                        </div>
                    </li>
                );
            }, this);

            return items;
        } else {
            return "Sorry. Something went wrong.";
        }
    },

    _select: function(item) {
        this.props.selectFn(item);
    },

    _itemIsSelected: function(item) {
        return item && _.isEqual(item.id, this.props.query[this.props.queryKey]);
    },

    render: function() {
        var selection,
            searchBar,
            remove,
            removeable = false;

        this.props.fields.forEach(function (item) {
            if (this._itemIsSelected(item)) {
                selection = item;
            }
        }, this);

        var placeholder = this.props.placeholder;

        if(selection) {
            placeholder = (
                <span>
                    {selection.name}
                    <span className="block">{selection.id}</span>
                </span>
            );
        }



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

        return (
            <div className={moduleClasses}>
                <div className="SelectionModule-trigger">
                    <a className="QueryOption p1 lg-p2 flex align-center" onClick={this._toggleOpen}>
                        {placeholder}
                    </a>
                </div>
                <div className={itemListClasses}>
                    {searchBar}
                    <ul className="SelectionList">
                        {this._listDimensions(selection)}
                    </ul>
                </div>
            </div>
        );
    }
});
