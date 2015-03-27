'use strict';
/*global cx, OnClickOutside, SearchBar*/

var SelectionModule = React.createClass({
    displayName:'SelectionModule',
    propTypes: {
        action: React.PropTypes.func.isRequired,
        display: React.PropTypes.string.isRequired,
        isInitiallyOpen: React.PropTypes.bool,
        items: React.PropTypes.array,
        remove: React.PropTypes.func,
        selectedKey: React.PropTypes.string,
        selectedValue: React.PropTypes.number,
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
    handleClickOutside: function () {
        this.setState({
            open: false
        });
    },
    _enableSearch: function () {
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
    _toggleOpen: function () {
        var open = !this.state.open;
        this.setState({
            open: open
        });
    },
    _displayCustom: function (values) {
        var custom = [];
        this.props.children.forEach(function (element) {
            var newElement = element;
            newElement.props.children = values[newElement.props.content];
            custom.push(element);
        });
        return custom;
    },
    _listItems: function (selection) {
        var items,
            remove;

        if(this.props.items) {
            items = this.props.items.map(function (item, index) {
                var display = item[this.props.display] || item;
                var itemClassName = cx({
                    'SelectionItem' : true,
                    'selected': selection == display
                });
                // if children are provided, use the custom layout display
                return (
                    <li className={itemClassName} onClick={this._select.bind(null, item)} key={index}>
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
    _select: function (item) {
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
    render: function () {
        var selection;
        this.props.items.map(function (item) {
            if(item[this.props.selectedKey] === this.props.selectedValue) {
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
            var style = {
                fill: '#ddd'
            };
            remove = (
                <a className="RemoveTrigger" href="#" onClick={this.props.remove.bind(null, this.props.index)}>
                    <svg className="geomicon" data-icon="close" viewBox="0 0 32 32" style={style} width="16px" height="16px">
                        <path d="M4 8 L8 4 L16 12 L24 4 L28 8 L20 16 L28 24 L24 28 L16 20 L8 28 L4 24 L12 16 z "></path>
                    </svg>
                </a>
            );
        }

        return (
            <div className={moduleClasses}>
                <div className="SelectionModule-trigger">
                    <a className="SelectionTitle" onClick={this._toggleOpen}>
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
