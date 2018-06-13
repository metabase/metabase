import React, { Component } from "react";
import PropTypes from "prop-types";

import "./ColumnarSelector.css";

import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";

export default class ColumnarSelector extends Component {
  static propTypes = {
    columns: PropTypes.array.isRequired,
  };

  render() {
    const isItemSelected = (item, column) =>
      column.selectedItems
        ? column.selectedItems.includes(item)
        : column.selectedItem === item;
    const isItemDisabled = (item, column) =>
      column.disabledOptionIds
        ? column.disabledOptionIds.includes(item.id)
        : false;

    let columns = this.props.columns.map((column, columnIndex) => {
      let sectionElements;
      if (column) {
        let lastColumn = columnIndex === this.props.columns.length - 1;
        let sections = column.sections || [column];
        sectionElements = sections.map((section, sectionIndex) => {
          let title = section.title;
          let items = section.items.map((item, rowIndex) => {
            let itemClasses = cx({
              "ColumnarSelector-row": true,
              "ColumnarSelector-row--selected": isItemSelected(item, column),
              "ColumnarSelector-row--disabled": isItemDisabled(item, column),
              flex: true,
              "no-decoration": true,
              "cursor-default": isItemDisabled(item, column),
            });
            let checkIcon = lastColumn ? <Icon name="check" size={14} /> : null;
            let descriptionElement;
            let description =
              column.itemDescriptionFn && column.itemDescriptionFn(item);
            if (description) {
              descriptionElement = (
                <div className="ColumnarSelector-description">
                  {description}
                </div>
              );
            }
            return (
              <li key={rowIndex}>
                <a
                  className={itemClasses}
                  onClick={
                    !isItemDisabled(item, column) &&
                    column.itemSelectFn.bind(null, item)
                  }
                >
                  {checkIcon}
                  <div className="flex flex-column ml1">
                    {column.itemTitleFn(item)}
                    {descriptionElement}
                  </div>
                </a>
              </li>
            );
          });
          let titleElement;
          if (title) {
            titleElement = (
              <div className="ColumnarSelector-title">{title}</div>
            );
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
        <div
          key={columnIndex}
          className="ColumnarSelector-column scroll-y scroll-show"
        >
          {sectionElements}
        </div>
      );
    });

    return <div className="ColumnarSelector">{columns}</div>;
  }
}
