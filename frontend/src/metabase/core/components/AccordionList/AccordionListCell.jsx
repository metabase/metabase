/* eslint-disable react/prop-types */

import cx from "classnames";
import { t } from "ttag";

import ListSearchField from "metabase/components/ListSearchField";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import ListS from "metabase/css/components/list.module.css";
import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import { Icon, Box } from "metabase/ui";

import {
  ListCellItem,
  FilterContainer,
  Content,
} from "./AccordionListCell.styled";

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
  renderItemLabel,
  renderItemName,
  renderItemDescription,
  renderItemIcon,
  renderItemExtra,
  renderItemWrapper,
  showSpinner,
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
          className={cx(
            CS.pt2,
            CS.mb1,
            CS.mx2,
            CS.h5,
            CS.textUppercase,
            CS.textBold,
          )}
          style={{ color: color }}
        >
          {section.name}
        </div>
      );
    } else {
      const icon = renderSectionIcon(section);
      const name = section.name;
      content = (
        <div
          data-element-id="list-section-header"
          className={cx(
            ListS.ListSectionHeader,
            CS.px2,
            CS.py2,
            CS.flex,
            CS.alignCenter,
            CS.hoverParent,
            {
              [ListS.ListSectionHeaderCursor]: hasCursor,
              [CS.cursorPointer]: canToggleSections,
              [CS.textBrand]: sectionIsExpanded(sectionIndex),
            },
          )}
          onClick={
            canToggleSections ? () => toggleSection(sectionIndex) : undefined
          }
        >
          {icon && (
            <span
              className={cx(
                CS.mr1,
                CS.flex,
                CS.alignCenter,
                ListS.ListSectionIcon,
              )}
            >
              {icon}
            </span>
          )}
          {name && (
            <h3
              data-element-id="list-section-title"
              className={cx(ListS.ListSectionTitle, CS.textWrap)}
            >
              {name}
            </h3>
          )}
          {showSpinner(section) && (
            <Box ml="0.5rem">
              <LoadingSpinner size={16} borderWidth={2} />
            </Box>
          )}
          {sections.length > 1 && section.items && section.items.length > 0 && (
            <span className={cx(CS.flexAlignRight, CS.ml1, CS.hoverChild)}>
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
      <div className={cx(CS.m1, CS.flex, CS.layoutCentered)}>
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
    const extra = renderItemExtra(item, isSelected);
    const label = renderItemLabel ? renderItemLabel(item) : name;
    content = (
      <ListCellItem
        data-testid={itemTestId}
        aria-label={label}
        role="option"
        aria-selected={isSelected}
        aria-disabled={!isClickable}
        isClickable={isClickable}
        data-element-id="list-item"
        className={cx(
          ListS.ListItem,
          CS.flex,
          CS.mx1,
          {
            [ListS.ListItemSelected]: isSelected,
            [ListS.ListItemDisabled]: !isClickable,
            [ListS.ListItemCursor]: hasCursor,
            [CS.mb1]: isLastItem,
          },
          getItemClassName(item, itemIndex),
        )}
        style={getItemStyles(item, itemIndex)}
      >
        <Content
          isClickable={isClickable}
          onClick={isClickable ? () => onChange(item) : undefined}
        >
          {icon && (
            <span
              className={cx(
                "List-item-icon",
                CS.textDefault,
                CS.flex,
                CS.alignCenter,
              )}
            >
              {icon}
            </span>
          )}
          <div className="List-item-content">
            {name && (
              <h4
                data-element-id="list-item-title"
                className={cx(ListS.ListItemTitle, CS.ml1, CS.textWrap)}
              >
                {name}
              </h4>
            )}
            {description && (
              <p className={cx(ListS.ListItemDescription, CS.ml1, CS.textWrap)}>
                {description}
              </p>
            )}
          </div>
          {showSpinner(item) && (
            <Box ml="0.5rem">
              <LoadingSpinner size={16} borderWidth={2} />
            </Box>
          )}
        </Content>
        {extra}
        {showItemArrows && (
          <div
            className={cx(ListS.ListItemArrow, CS.flex, CS.alignCenter, CS.px1)}
          >
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
      data-element-id="list-section"
      className={cx(section.className, {
        [ListS.ListSectionExpanded]: sectionIsExpanded(sectionIndex),
        [ListS.ListSectionToggleAble]: canToggleSections,
      })}
    >
      {content}
    </div>
  );
};
