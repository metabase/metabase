"use strict";

import Icon from "./icon.react";

var cx = React.addons.classSet;

export default React.createClass({
    displayName: "ColumnarSelector",

    render: function() {
        var columns = this.props.columns.map((column, columnIndex) => {
            var title, items;
            if (column) {
                var lastColumn = columnIndex === this.props.columns.length - 1;
                title = column.title;
                items = column.items.map((item, rowIndex) => {
                    var itemClasses = cx({
                        'ColumnarSelector-row': true,
                        'ColumnarSelector-row--selected': item === column.selectedItem
                    });
                    var checkIcon = lastColumn ? <Icon name="check" width="14" height="14"/> : null;
                    return (
                        <li key={rowIndex} className={itemClasses} onClick={column.itemSelectFn.bind(null, item)}>{checkIcon}{column.itemTitleFn(item)}</li>
                    );
                });
            }
            return (
                <div key={columnIndex} className="ColumnarSelector-column">
                    <div className="ColumnarSelector-title">{title}</div>
                    <ul className="ColumnarSelector-rows">{items}</ul>
                </div>
            );
        });

        return (
            <div className="ColumnarSelector">{columns}</div>
        );
    }
});
