import { useMergedRef } from "@mantine/hooks";
import cx from "classnames";
import {
  type CSSProperties,
  type ReactNode,
  type Ref,
  forwardRef,
  useEffect,
  useRef,
} from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { ListSearchField } from "metabase/common/components/ListSearchField";
import { LoadingSpinner } from "metabase/common/components/LoadingSpinner";
import ListS from "metabase/css/components/list.module.css";
import CS from "metabase/css/core/index.css";
import type { ColorName } from "metabase/lib/colors/types";
import type { TextInputProps } from "metabase/ui";
import { Box, Icon, Text, isValidIconName } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";

import styles from "./AccordionListCell.module.css";
import {
  Content,
  EmptyStateContainer,
  IconWrapper,
  ListCellItem,
} from "./AccordionListCell.styled";
import type { Item, Row, Section } from "./types";
import { isReactNode } from "./utils";

export type SharedAccordionProps<
  TItem extends Item,
  TSection extends Section<TItem>,
> = {
  alwaysExpanded?: boolean;
  color?: ColorName;
  getItemClassName?: (item: TItem, index: number) => string | undefined;
  getItemStyles?: (item: TItem, index: number) => CSSProperties | undefined;
  itemIsClickable?: (item: TItem, index: number) => boolean | undefined;
  itemIsSelected?: (item: TItem, index: number) => boolean | undefined;
  itemTestId?: string;
  renderItemDescription?: (item: TItem) => ReactNode;
  renderItemExtra?: (item: TItem, isSelected: boolean) => ReactNode;
  renderItemIcon?: (item: TItem) => ReactNode;
  renderItemLabel?: (item: TItem) => string | undefined;
  renderItemName?: (item: TItem) => string | undefined;
  renderItemWrapper?: (content: ReactNode, item: TItem) => ReactNode;
  renderSectionIcon?: (section: TSection) => ReactNode;
  searchInputProps?: TextInputProps;
  searchPlaceholder?: string;
  showItemArrows?: boolean;
  showSpinner?: (itemOrSection: TItem | TSection) => boolean;
};

type AccordionListCellProps<
  TItem extends Item,
  TSection extends Section<TItem>,
> = SharedAccordionProps<TItem, TSection> & {
  canToggleSections: boolean;
  hasCursor: boolean;
  onChange: (item: TItem) => void;
  onChangeSearchText: (searchText: string) => void;
  row: Row<TItem, TSection>;
  searchText: string;
  sectionIsExpanded: (sectionIndex: number) => boolean | undefined;
  sections: TSection[];
  style?: CSSProperties;
  toggleSection: (sectionIndex: number) => void;
};

export const AccordionListCell = forwardRef(function AccordionListCell<
  TItem extends Item,
  TSection extends Section<TItem>,
>(
  {
    alwaysExpanded,
    canToggleSections,
    color: colorProp = "brand",
    getItemClassName = (item: TItem) => {
      if (
        typeof item === "object" &&
        "className" in item &&
        typeof item.className === "string"
      ) {
        return item.className;
      }
    },
    getItemStyles = () => ({}),
    hasCursor,
    itemIsClickable = () => true,
    itemIsSelected = () => false,
    itemTestId,
    onChange,
    onChangeSearchText,
    renderSectionIcon = (section: TSection) =>
      section.icon && <Icon name={section.icon} />,
    renderItemLabel,
    renderItemName = (item: TItem) => {
      if (
        typeof item === "object" &&
        "name" in item &&
        typeof item.name === "string"
      ) {
        return item.name;
      }
    },
    renderItemDescription = (item: TItem) => {
      if (
        typeof item === "object" &&
        "description" in item &&
        isReactNode(item.description)
      ) {
        return item.description;
      }
    },
    renderItemExtra = () => null,
    renderItemIcon = (item: TItem) => {
      if (
        typeof item === "object" &&
        "icon" in item &&
        isValidIconName(item.icon)
      ) {
        return <Icon name={item.icon} />;
      }
      return null;
    },
    renderItemWrapper = (content: ReactNode) => content,
    row,
    searchInputProps,
    searchPlaceholder = t`Find...`,
    searchText,
    sectionIsExpanded,
    sections,
    showItemArrows,
    showSpinner = () => false,
    style,
    toggleSection,
  }: AccordionListCellProps<TItem, TSection>,
  ref: Ref<HTMLDivElement>,
) {
  const { type, section, sectionIndex, isLastSection } = row;
  let content;
  let borderTop;
  let borderBottom;

  const innerRef = useRef<HTMLDivElement>(null);
  const mergedRef = useMergedRef(ref, innerRef);

  useEffect(() => {
    if (hasCursor) {
      innerRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [hasCursor]);

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
          style={{ color: color(colorProp) }}
          data-testid="list-section-header"
        >
          {section.name}
        </div>
      );
    } else {
      const icon = renderSectionIcon(section);
      const name = section.name;

      borderTop =
        section.type === "back" ||
        section.type === "action" ||
        (section.items?.length ?? 0) > 0;
      borderBottom = section.type === "back";

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
          data-testid="list-section-header"
          data-hascursor={hasCursor}
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
            <Text
              role="heading"
              data-element-id="list-section-title"
              className={cx(ListS.ListSectionTitle, CS.textWrap)}
              fz="lg"
              lh="normal"
              fw="bold"
            >
              {name}
            </Text>
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
  } else if (type === "action") {
    const icon = renderSectionIcon(section);
    const name = section.name;
    borderTop = true;
    borderBottom = !isLastSection;

    content = (
      <div
        className={cx(
          ListS.ListSectionHeader,
          CS.px2,
          CS.py2,
          CS.flex,
          CS.alignCenter,
          CS.hoverParent,
          styles.action,
          {
            [ListS.ListSectionHeaderCursor]: hasCursor,
            [CS.cursorPointer]: canToggleSections,
            [CS.textBrand]: sectionIsExpanded(sectionIndex),
          },
        )}
        role="button"
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
          <Text
            data-element-id="list-section-title"
            className={cx(ListS.ListSectionTitle, CS.textWrap)}
            fz="lg"
            lh="normal"
            fw="bold"
          >
            {name}
          </Text>
        )}
        {showSpinner(section) && (
          <Box ml="0.5rem">
            <LoadingSpinner size={16} borderWidth={2} />
          </Box>
        )}
        <IconWrapper>
          <Icon name="chevronright" size={12} />
        </IconWrapper>
      </div>
    );
  } else if (type === "no-results") {
    content = (
      <EmptyStateContainer>
        <EmptyState message={t`Didn't find any results`} icon="search" />
      </EmptyStateContainer>
    );
  } else if (type === "loading") {
    content = (
      <div className={cx(CS.m1, CS.flex, CS.layoutCentered)}>
        <LoadingSpinner />
      </div>
    );
  } else if (type === "search") {
    borderBottom = true;
    content = (
      <ListSearchField
        autoFocus
        onChange={(e) => onChangeSearchText(e.target.value)}
        onResetClick={() => onChangeSearchText("")}
        value={searchText}
        placeholder={searchPlaceholder}
        p="sm"
        {...searchInputProps}
      />
    );
  } else if (type === "item") {
    const { item, itemIndex, isLastItem } = row;
    const isSelected = itemIsSelected(item, itemIndex);
    const isClickable = itemIsClickable(item, itemIndex) ?? false;
    const icon = renderItemIcon(item);
    const name = renderItemName(item);
    const description = renderItemDescription(item);
    const extra = renderItemExtra(item, isSelected ?? false);
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
        data-hascursor={hasCursor}
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
        style={getItemStyles(item, itemIndex) ?? {}}
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
          <div>
            {name && (
              <Text
                role="heading"
                lh="normal"
                fw="bold"
                data-element-id="list-item-title"
                className={cx(ListS.ListItemTitle, CS.ml1, CS.textWrap)}
              >
                {name}
              </Text>
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

  const isSticky = type === "search";

  return (
    <div
      ref={mergedRef}
      style={style}
      data-element-id="list-section"
      className={cx(section.className, {
        [ListS.ListSectionExpanded]: sectionIsExpanded(sectionIndex),
        [ListS.ListSectionToggleAble]: canToggleSections,
        [styles.borderTop]: borderTop,
        [styles.borderBottom]: borderBottom,
        [styles.sticky]: isSticky,
      })}
    >
      {content}
    </div>
  );
});
