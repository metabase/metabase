/* eslint-disable react/prop-types */

import React from "react";
import { t } from "ttag";

import cx from "classnames";
import { color } from "metabase/lib/colors";

import { Icon } from "metabase/core/components/Icon";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import ListSearchField from "metabase/components/ListSearchField";
import { ListCellItem, FilterContainer } from "./AccordionListCell.styled";

export const AccordionListCell = ({
  style,
  sections,
  row,
  onChange,
  itemIsSelected,
  itemIsClickable,
  sectionIsExpanded,
  canToggleSections,
  alwaysExpanded,
  toggleSection,
  renderSectionIcon,
  renderSectionExtra,
  renderItemName,
  renderItemDescription,
  renderItemIcon,
  renderItemExtra,
  renderItemWrapper,
  searchText,
  onChangeSearchText,
  searchPlaceholder = t`Find...`,
  showItemArrows,
  itemTestId,
  getItemClassName,
  getItemStyles,
  searchInputProps,
  hasCursor,
}) => {
  const { type, section, sectionIndex, item, itemIndex, isLastItem } = row;
  let content;
  if (type === "header") {
    if (alwaysExpanded) {
      content = (
        <div
          className="pt2 mb1 mx2 h5 text-uppercase text-bold"
          style={{ color: color }}
        >
          {section.name}
        </div>
      );
    } else {
      const icon = renderSectionIcon(section);
      const extra = renderSectionExtra(section, sectionIndex);
      const name = section.name;
      content = (
        <div
          className={cx(
            "List-section-header px2 py2 flex align-center hover-parent hover--opacity",
            {
              "List-section-header--cursor": hasCursor,
              "cursor-pointer": canToggleSections,
              "text-brand": sectionIsExpanded(sectionIndex),
            },
          )}
          onClick={
            canToggleSections ? () => toggleSection(sectionIndex) : undefined
          }
        >
          {icon && (
            <span className="List-section-icon mr1 flex align-center">
              {icon}
            </span>
          )}
          {name && <h3 className="List-section-title text-wrap">{name}</h3>}
          {extra}
          {sections.length > 1 && section.items && section.items.length > 0 && (
            <span className="flex-align-right ml1 hover-child">
              <Icon
                name={
                  sectionIsExpanded(sectionIndex) ? "chevronup" : "chevrondown"
                }
                size={12}
              />
            </span>
          )}
        </div>
      );
    }
  } else if (type === "header-hidden") {
    content = <div className="my1" />;
  } else if (type === "loading") {
    content = (
      <div className="m1 flex layout-centered">
        <LoadingSpinner />
      </div>
    );
  } else if (type === "search") {
    content = (
      <FilterContainer>
        <ListSearchField
          fullWidth
          autoFocus
          onChange={e => onChangeSearchText(e.target.value)}
          onResetClick={() => onChangeSearchText("")}
          value={searchText}
          placeholder={searchPlaceholder}
          {...searchInputProps}
        />
      </FilterContainer>
    );
  } else if (type === "item") {
    const isSelected = itemIsSelected(item, itemIndex);
    const isClickable = itemIsClickable(item, itemIndex);
    const icon = renderItemIcon(item);
    const name = renderItemName(item);
    const description = renderItemDescription(item);
    content = (
      <ListCellItem
        data-testid={itemTestId}
        aria-label={name}
        role="option"
        aria-selected={isSelected}
        isClickable={isClickable}
        className={cx(
          "List-item flex mx1",
          {
            "List-item--selected": isSelected,
            "List-item--disabled": !isClickable,
            "List-item--cursor": hasCursor,
            mb1: isLastItem,
          },
          getItemClassName(item, itemIndex),
        )}
        style={getItemStyles(item, itemIndex)}
      >
        <span
          className={cx(
            "p1 flex-auto flex align-center",
            isClickable ? "cursor-pointer" : "cursor-default",
          )}
          onClick={isClickable ? () => onChange(item) : undefined}
        >
          {icon && (
            <span className="List-item-icon text-default flex align-center">
              {icon}
            </span>
          )}
          <div>
            {name && <h4 className="List-item-title ml1 text-wrap">{name}</h4>}
            {description && (
              <p className="List-item-description ml1 text-wrap">
                {description}
              </p>
            )}
          </div>
        </span>
        {renderItemExtra(item, itemIndex, isSelected)}
        {showItemArrows && (
          <div className="List-item-arrow flex align-center px1">
            <Icon name="chevronright" size={8} />
          </div>
        )}
      </ListCellItem>
    );

    if (renderItemWrapper) {
      content = renderItemWrapper(content, item);
    }
  }

  return (
    <div
      style={style}
      aria-expanded={sectionIsExpanded}
      className={cx("List-section", section.className, {
        "List-section--expanded": sectionIsExpanded(sectionIndex),
        "List-section--togglable": canToggleSections,
      })}
    >
      {content}
    </div>
  );
};
