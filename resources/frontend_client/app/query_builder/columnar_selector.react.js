"use strict";

import Icon from "./icon.react";

var cx = React.addons.classSet;

export default React.createClass({
    displayName: "ColumnarSelector",

    render: function() {
        var columns = this.props.columns.map((column, columnIndex) => {
            var sectionElements;
            if (column) {
                var lastColumn = columnIndex === this.props.columns.length - 1;
                var sections = column.sections || [column];
                sectionElements = sections.map((section, sectionIndex) => {
                    var title = section.title;
                    var items = section.items.map((item, rowIndex) => {
                        var itemClasses = cx({
                            'cursor-pointer': true,
                            'ColumnarSelector-row': true,
                            'ColumnarSelector-row--selected': item === column.selectedItem
                        });
                        var checkIcon = lastColumn ? <Icon name="check" width="14" height="14"/> : null;
                        return (
                            <li key={rowIndex} className={itemClasses} onClick={column.itemSelectFn.bind(null, item)}>
                                {checkIcon}
                                {column.itemTitleFn(item)}
                            </li>
                        );
                    });
                    var titleElement;
                    if (title) {
                        titleElement = <div className="ColumnarSelector-title">{title}</div>
                    }
                    return (
                        <section key={sectionIndex}>
                            {titleElement}
                            <ul className="ColumnarSelector-rows">{items}</ul>
                        </section>
                    );
                });
            }

            return (
                <div key={columnIndex} className="ColumnarSelector-column">
                    {sectionElements}
                </div>
            );
        });

        return (
            <div className="ColumnarSelector">{columns}</div>
        );
    }
});
