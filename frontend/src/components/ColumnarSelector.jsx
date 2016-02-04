import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";

export default class ColumnarSelector extends Component {
    static propTypes = {
        columns: PropTypes.array.isRequired
    };

    render() {
        var columns = this.props.columns.map((column, columnIndex) => {
            var sectionElements;
            if (column) {
                var lastColumn = columnIndex === this.props.columns.length - 1;
                var sections = column.sections || [column];
                sectionElements = sections.map((section, sectionIndex) => {
                    var title = section.title;
                    var items = section.items.map((item, rowIndex) => {
                        var itemClasses = cx({
                            'ColumnarSelector-row': true,
                            'ColumnarSelector-row--selected': item === column.selectedItem,
                            'flex': true,
                            'no-decoration': true
                        });
                        var checkIcon = lastColumn ? <Icon name="check" width="14" height="14"/> : null;
                        var descriptionElement;
                        var description = column.itemDescriptionFn && column.itemDescriptionFn(item);
                        if (description) {
                            descriptionElement = <div className="ColumnarSelector-description">{description}</div>
                        }
                        return (
                            <li key={rowIndex}>
                                <a className={itemClasses} onClick={column.itemSelectFn.bind(null, item)}>
                                    {checkIcon}
                                    <div className="flex flex-column">
                                        {column.itemTitleFn(item)}
                                        {descriptionElement}
                                    </div>
                                </a>
                            </li>
                        );
                    });
                    var titleElement;
                    if (title) {
                        titleElement = <div className="ColumnarSelector-title">{title}</div>
                    }
                    return (
                        <section key={sectionIndex} className="ColumnarSelector-section">
                            {titleElement}
                            <ul className="ColumnarSelector-rows">{items}</ul>
                        </section>
                    );
                });
            }

            return (
                <div key={columnIndex} className="ColumnarSelector-column scroll-y scroll-show">
                    {sectionElements}
                </div>
            );
        });

        return (
            <div className="ColumnarSelector">{columns}</div>
        );
    }
}
