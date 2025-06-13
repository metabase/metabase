import { getIn } from "icepick";
import {
  type CSSProperties,
  Component,
  type HTMLProps,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  createRef,
} from "react";
import {
  type Alignment,
  CellMeasurer,
  CellMeasurerCache,
  List,
} from "react-virtualized";
import _ from "underscore";

import { Icon, type IconName } from "metabase/ui";

import { AccordionListRoot } from "./AccordionList.styled";
import { AccordionListCell } from "./AccordionListCell";
import type { Item, Row, Section } from "./types";
import { type Cursor, getNextCursor, getPrevCursor } from "./utils";

type Props<T extends Item> = {
  style?: CSSProperties & {
    "--accordion-list-width"?: string;
  };
  className?: string;
  id?: string;

  // TODO: pass width to this component as solely number or string if possible
  // currently prop is number on initialization, then string afterwards
  width?: string | number;
  maxHeight?: number;

  role?: string;

  sections: Section<T>[];

  initiallyOpenSection?: number;
  globalSearch?: boolean;
  openSection?: number;
  onChange?: (item: T) => void;
  onChangeSection?: (
    section: Section<T>,
    sectionIndex: number,
  ) => boolean | void;

  // section getters/render props
  renderSectionIcon?: (section: Section<T>) => ReactNode;
  renderSearchSection?: (section: Section<T>) => ReactNode;

  // item getters/render props
  itemIsSelected?: (item: T) => boolean | undefined;
  itemIsClickable?: (item: T) => boolean;
  renderItemName?: (item: T) => string | undefined;
  renderItemLabel?: (item: T) => string | undefined;
  renderItemDescription?: (item: T) => ReactNode;
  renderItemIcon?: (item: T) => ReactNode;
  renderItemExtra?: (item: T, isSelected: boolean) => ReactNode;
  renderItemWrapper?: (content: ReactNode, item: T) => ReactNode;
  getItemClassName?: (item: T) => string | undefined;
  getItemStyles?: (item: T) => CSSProperties | undefined;

  alwaysTogglable?: boolean;
  alwaysExpanded?: boolean;
  hideSingleSectionTitle?: boolean;
  showSpinner?: (itemOrSection: T | Section<T>) => boolean;
  showItemArrows?: boolean;

  searchable?: boolean | ((section: Section) => boolean | undefined);
  searchProp?: string | string[];
  searchCaseInsensitive?: boolean;
  searchFuzzy?: boolean;
  searchPlaceholder?: string;
  searchInputProps?: HTMLProps<HTMLInputElement>;
  hideEmptySectionsInSearch?: boolean;
  hasInitialFocus?: boolean;

  itemTestId?: string;
  "data-testid"?: string | null;

  withBorders?: boolean;
};

type State = {
  openSection: number | null;
  searchText: string;
  cursor: Cursor | null;
  scrollToAlignment: Alignment;
};

export class AccordionList<T extends Item> extends Component<Props<T>, State> {
  _cache: CellMeasurerCache;

  _list: RefObject<List>;
  listRootRef: RefObject<HTMLDivElement>;

  _initialSelectedRowIndex?: number;
  _startIndex?: number;
  _stopIndex?: number;
  _forceUpdateTimeout?: NodeJS.Timeout | null;

  constructor(props: Props<T>, context: unknown) {
    super(props, context);

    let openSection;
    // use initiallyOpenSection prop if present
    if (props.initiallyOpenSection !== undefined) {
      openSection = props.initiallyOpenSection;
    }
    // otherwise try to find the selected section, if any
    if (openSection === undefined) {
      openSection = _.findIndex(props.sections, (section, index) =>
        this.sectionIsSelected(section, index),
      );
      if (openSection === -1) {
        openSection = undefined;
      }
    }
    // default to the first section
    if (openSection === undefined) {
      openSection = 0;
    }

    this.state = {
      openSection,
      searchText: "",
      cursor: null,
      scrollToAlignment: "start",
    };

    this._cache = new CellMeasurerCache({
      fixedWidth: true,
      minHeight: 10,
    });

    this.listRootRef = createRef();
    this._list = createRef();
  }

  componentDidMount() {
    // NOTE: for some reason the row heights aren't computed correctly when
    // first rendering, so force the list to update
    this._forceUpdateList();
    // `scrollToRow` upon mounting, after _forceUpdateList
    // Use list.scrollToRow instead of the scrollToIndex prop since the
    // causes the list's scrolling to be pinned to the selected row
    setTimeout(() => {
      const container = this._getListContainerElement();

      const hasFocusedChildren = container?.contains(document.activeElement);
      if (!hasFocusedChildren && this.props.hasInitialFocus) {
        container?.focus();
      }

      const index = this._initialSelectedRowIndex;

      if (
        this._list &&
        index != null &&
        this._startIndex != null &&
        this._stopIndex != null &&
        !(index >= this._startIndex && index <= this._stopIndex)
      ) {
        this._list.current?.scrollToRow(index);
      }
    }, 0);
  }

  componentDidUpdate(_prevProps: Props<T>, prevState: State) {
    // if anything changes that affects the selected rows we need to clear the row height cache
    if (
      this.state.openSection !== prevState.openSection ||
      this.state.searchText !== prevState.searchText
    ) {
      this._clearRowHeightCache();
    }
  }

  componentWillUnmount() {
    // ensure _forceUpdateList is not called after unmounting
    if (this._forceUpdateTimeout != null) {
      clearTimeout(this._forceUpdateTimeout);
      this._forceUpdateTimeout = null;
    }
  }

  _getListContainerElement() {
    const element = this.isVirtualized()
      ? // @ts-expect-error: TODO remove reliance on internals here
        this._list.current?.Grid?._scrollingContainer
      : this.listRootRef.current;

    return element ?? null;
  }

  // resets the row height cache when the displayed rows change
  _clearRowHeightCache() {
    this._cache.clearAll();
    // NOTE: unclear why this needs to be async
    this._forceUpdateTimeout = setTimeout(() => {
      this._forceUpdateTimeout = null;
      this._forceUpdateList();
    });
  }

  _forceUpdateList() {
    if (this._list) {
      // NOTE: unclear why this particular set of functions works, but it does
      this._list.current?.invalidateCellSizeAfterRender({
        columnIndex: 0,
        rowIndex: 0,
      });
      this._list.current?.forceUpdateGrid();
      this.forceUpdate();
    }
  }

  toggleSection = (sectionIndex: number) => {
    const { sections, onChangeSection } = this.props;
    if (onChangeSection) {
      if (onChangeSection(sections[sectionIndex], sectionIndex) === false) {
        return;
      }
    }

    const openSection = this.getOpenSection();
    if (openSection === sectionIndex) {
      this.setState({ openSection: null });
    } else {
      this.setState({ openSection: sectionIndex });
    }
  };

  getOpenSection() {
    if (this.props.sections.length === 1) {
      return 0;
    }

    let { openSection } = this.state;
    if (openSection === undefined) {
      for (const [index, section] of this.props.sections.entries()) {
        if (this.sectionIsSelected(section, index)) {
          openSection = index;
          break;
        }
      }
    }
    return openSection;
  }

  sectionIsSelected(_section: Section, sectionIndex: number) {
    const { sections } = this.props;
    let selectedSection = null;
    for (let i = 0; i < sections.length; i++) {
      if (
        _.some(sections[i]?.items ?? [], (item) =>
          Boolean(this.props.itemIsSelected?.(item)),
        )
      ) {
        selectedSection = i;
        break;
      }
    }
    return selectedSection === sectionIndex;
  }

  handleChange = (item: T) => {
    if (this.props.onChange) {
      this.props.onChange(item);
    }
  };

  handleChangeSearchText = (searchText: string) => {
    this.setState({ searchText, cursor: null });
  };

  searchPredicate = (item: T, searchPropMember: string) => {
    const { searchCaseInsensitive = true, searchFuzzy } = this.props;
    let { searchText } = this.state;
    const path = searchPropMember.split(".");
    let itemText = String(getIn(item, path) || "");
    if (searchCaseInsensitive) {
      itemText = itemText.toLowerCase();
      searchText = searchText.toLowerCase();
    }
    if (searchFuzzy) {
      return itemText.indexOf(searchText) >= 0;
    } else {
      return itemText.startsWith(searchText);
    }
  };

  checkSectionHasItemsMatchingSearch = (
    section: Section<T>,
    searchFilter: (item: T) => boolean,
  ) => {
    return (section.items?.filter(searchFilter).length ?? 0) > 0;
  };

  getFirstSelectedItemCursor = () => {
    const { sections, itemIsSelected = () => false } = this.props;

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex];
      for (
        let itemIndex = 0;
        itemIndex < (section.items?.length ?? 0);
        itemIndex++
      ) {
        const item = section.items?.[itemIndex];
        if (item && itemIsSelected(item)) {
          return {
            sectionIndex,
            itemIndex,
          };
        }
      }
    }
    return null;
  };

  getInitialCursor = () => {
    const { cursor, searchText } = this.state;

    return (
      cursor ??
      (searchText.length === 0 ? this.getFirstSelectedItemCursor() : null)
    );
  };

  handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();

      const prevCursor = getPrevCursor(
        this.getInitialCursor(),
        this.props.sections,
        this.isSectionExpanded,
        this.canSelectSection,
        this.searchFilter,
      );

      return this.setState({
        cursor: prevCursor,
        scrollToAlignment: "auto",
      });
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      const nextCursor = getNextCursor(
        this.getInitialCursor(),
        this.props.sections,
        this.isSectionExpanded,
        this.canSelectSection,
        this.searchFilter,
      );

      return this.setState({
        cursor: nextCursor,
        scrollToAlignment: "auto",
      });
    }

    if (event.key === "Enter") {
      const { cursor } = this.state;

      if (!cursor) {
        return;
      }

      const isSection = cursor.sectionIndex != null && cursor.itemIndex == null;

      if (!isSection) {
        const { sections } = this.props;
        const item =
          cursor.itemIndex != null
            ? sections[cursor.sectionIndex].items?.[cursor.itemIndex]
            : null;

        if (item) {
          this.props.onChange?.(item);
        }
        return;
      }

      this.toggleSection(cursor.sectionIndex);
    }

    const searchRow = this.getRows().findIndex((row) => row.type === "search");

    if (searchRow >= 0 && this.isVirtualized()) {
      this._list.current?.scrollToRow(searchRow);
    }
  };

  searchFilter = (item: T) => {
    const { searchProp = ["name", "displayName"] } = this.props;
    const { searchText } = this.state;

    if (!searchText || searchText.length === 0) {
      return true;
    }

    const searchProps = Array.isArray(searchProp) ? searchProp : [searchProp];

    const searchResults = searchProps.map((member) =>
      this.searchPredicate(item, member),
    );
    return searchResults.reduce((acc, curr) => acc || curr);
  };

  getRowsCached = (
    searchFilter: (item: T) => boolean,
    searchable:
      | boolean
      | ((section: Section<T>) => boolean | undefined)
      | undefined,
    sections: Section<T>[],
    alwaysTogglable: boolean,
    alwaysExpanded: boolean,
    hideSingleSectionTitle: boolean,
    itemIsSelected: (item: T) => boolean | undefined,
    hideEmptySectionsInSearch: boolean,
    openSection: number | null,
    _globalSearch: boolean,
    searchText: string,
  ): Row<T>[] => {
    // if any section is searchable just enable a global search
    let globalSearch = _globalSearch;

    const sectionIsExpanded = (sectionIndex: number) =>
      alwaysExpanded ||
      openSection === sectionIndex ||
      (globalSearch && searchText.length > 0);

    const sectionIsSearchable = (sectionIndex: number) =>
      typeof searchable === "function"
        ? searchable(sections[sectionIndex])
        : searchable;

    const rows: Row<T>[] = [];
    for (const [sectionIndex, section] of sections.entries()) {
      const isLastSection = sectionIndex === sections.length - 1;
      if (
        section.name &&
        (!hideSingleSectionTitle || sections.length > 1 || alwaysTogglable)
      ) {
        if (
          !searchable ||
          !(hideEmptySectionsInSearch || globalSearch) ||
          this.checkSectionHasItemsMatchingSearch(section, searchFilter) ||
          section.type === "action"
        ) {
          if (section.type === "action") {
            rows.push({
              type: "action",
              section,
              sectionIndex,
              isLastSection,
            });
          } else {
            rows.push({
              type: "header",
              section,
              sectionIndex,
              isLastSection,
            });
          }
        }
      }
      if (
        sectionIsSearchable(sectionIndex) &&
        sectionIsExpanded(sectionIndex) &&
        section.items &&
        section.items.length > 0 &&
        !section.loading &&
        !globalSearch
      ) {
        if (alwaysExpanded) {
          globalSearch = true;
        } else {
          rows.push({
            type: "search",
            section,
            sectionIndex,
            isLastSection,
          });
        }
      }
      if (
        sectionIsExpanded(sectionIndex) &&
        section.items &&
        section.items.length > 0 &&
        !section.loading
      ) {
        for (const [itemIndex, item] of section.items.entries()) {
          if (searchFilter(item)) {
            const isLastItem = itemIndex === section.items.length - 1;
            if (itemIsSelected(item)) {
              this._initialSelectedRowIndex = rows.length;
            }
            rows.push({
              type: "item",
              section,
              sectionIndex,
              isLastSection,
              item,
              itemIndex,
              isLastItem,
            });
          }
        }
      }
      if (sectionIsExpanded(sectionIndex) && section.loading) {
        rows.push({
          type: "loading",
          section,
          sectionIndex,
          isLastSection,
        });
      }
    }

    if (globalSearch) {
      const isSearching = searchText.length > 0;
      const isEmpty = rows.filter((row) => row.type === "item").length === 0;

      if (isSearching && isEmpty) {
        rows.unshift({
          type: "no-results",
          section: { items: [] },
          sectionIndex: 0,
          isLastSection: false,
        });
      }

      rows.unshift({
        type: "search",
        section: { items: [] },
        sectionIndex: 0,
        isLastSection: false,
      });
    }

    return rows;
  };

  getRows(): Row<T>[] {
    const {
      sections,
      searchable = (section: Section<T>) =>
        section?.items && section.items.length > 10,
      alwaysTogglable = false,
      alwaysExpanded = false,
      hideSingleSectionTitle = false,
      itemIsSelected = () => false,
      hideEmptySectionsInSearch = false,
      globalSearch = false,
    } = this.props;

    const { searchText } = this.state;

    const openSection = this.getOpenSection();

    return this.getRowsCached(
      this.searchFilter,
      searchable,
      sections,
      alwaysTogglable,
      alwaysExpanded,
      hideSingleSectionTitle,
      itemIsSelected,
      hideEmptySectionsInSearch,
      openSection,
      globalSearch,
      searchText,
    );
  }

  isVirtualized = () => this.props.maxHeight !== Infinity;

  canToggleSections = () => {
    const { alwaysTogglable, sections } = this.props;
    return alwaysTogglable || sections.length > 1;
  };

  isRowSelected = (row: Row<T>) => {
    if (!this.state.cursor) {
      return false;
    }

    const { sectionIndex, itemIndex } = this.state.cursor;
    return (
      row.sectionIndex === sectionIndex &&
      ("itemIndex" in row ? row.itemIndex === itemIndex : itemIndex == null)
    );
  };

  isSectionExpanded = (sectionIndex: number) => {
    const openSection = this.getOpenSection();

    return Boolean(
      this.props.alwaysExpanded ||
        openSection === sectionIndex ||
        (this.props.globalSearch && this.state.searchText.length > 0),
    );
  };

  canSelectSection = (sectionIndex: number) => {
    const section = this.props.sections[sectionIndex];
    if (!section) {
      return false;
    }

    if (section.type === "action") {
      return true;
    }

    return (
      !this.props.alwaysExpanded &&
      !(this.props.globalSearch && this.state.searchText.length > 0)
    );
  };

  // Because of virtualization, focused search input can be removed which does not trigger blur event.
  // We need to restore focus on the component root container to make keyboard navigation working
  handleSearchRemoval = () => {
    this._getListContainerElement()?.focus();
  };

  render() {
    const {
      id,
      style = {},
      width = 300,
      className,
      globalSearch = false,
      sections,
      role = "grid",
      withBorders,
      "data-testid": testId,

      itemIsClickable = () => true,
      itemIsSelected = () => false,
      renderSectionIcon = (section: Section<T>) =>
        section.icon && <Icon name={section.icon as IconName} />,
      renderItemLabel = () => undefined,
      renderItemName = (item: T) => ("name" in item ? item.name : "") as string,
      renderItemDescription = (item: T) =>
        "description" in item ? (item.description as string) : "",
      renderItemIcon = (item: T) =>
        "icon" in item && item.icon ? (
          <Icon name={item.icon as IconName} />
        ) : null,
      renderItemExtra = () => null,
      renderItemWrapper = (content: ReactNode) => content,
      showSpinner = () => false,

      getItemClassName = (item: T) =>
        "className" in item && typeof item.className === "string"
          ? item.className
          : undefined,
      getItemStyles = () => ({}),
      alwaysExpanded = false,
    } = this.props;
    const { cursor, scrollToAlignment } = this.state;

    const rows = this.getRows();

    const scrollToIndex =
      cursor != null ? rows.findIndex(this.isRowSelected) : undefined;

    const searchRowIndex = rows.findIndex((row) => row.type === "search");

    const itemProps = {
      itemIsClickable,
      itemIsSelected,
      renderSectionIcon,
      renderItemLabel,
      renderItemName,
      renderItemDescription,
      renderItemIcon,
      renderItemExtra,
      renderItemWrapper,
      showSpinner,
      getItemClassName,
      getItemStyles,
      style,
    };

    if (!this.isVirtualized()) {
      return (
        <AccordionListRoot
          ref={this.listRootRef}
          role="tree"
          onKeyDown={this.handleKeyDown}
          tabIndex={-1}
          className={className}
          style={{
            width,
            ...style,
          }}
          data-testid={testId}
        >
          {rows.map((row, index) => (
            <AccordionListCell<T>
              key={index}
              {...itemProps}
              row={row}
              sections={sections}
              onChange={this.handleChange}
              searchText={this.state.searchText}
              onChangeSearchText={this.handleChangeSearchText}
              sectionIsExpanded={this.isSectionExpanded}
              alwaysExpanded={
                alwaysExpanded ||
                (globalSearch && this.state.searchText.length > 0)
              }
              canToggleSections={this.canToggleSections()}
              toggleSection={this.toggleSection}
              hasCursor={this.isRowSelected(rows[index])}
              withBorders={withBorders}
            />
          ))}
        </AccordionListRoot>
      );
    }

    const mh = this.props.maxHeight ?? Infinity;
    const maxHeight = mh > 0 && mh < Infinity ? mh : window.innerHeight;

    const height = Math.min(
      maxHeight,
      rows.reduce(
        (height, _row, index) => height + this._cache.rowHeight({ index }),
        0,
      ),
    );

    const defaultListStyle = {
      // HACK - Ensure the component can scroll
      // This is a temporary fix to handle cases where the parent component doesn’t pass in the correct `maxHeight`
      overflowY: "auto" as const,
      outline: "none" as const,
    };

    return (
      <List
        id={id}
        ref={this._list}
        className={className}
        style={{ ...defaultListStyle, ...style }}
        containerStyle={{ pointerEvents: "auto" }}
        // @ts-expect-error: TODO
        width={width}
        height={height}
        rowCount={rows.length}
        deferredMeasurementCache={this._cache}
        rowHeight={this._cache.rowHeight}
        // HACK: needs to be large enough to render enough rows to fill the screen since we used
        // the CellMeasurerCache to calculate the height
        overscanRowCount={100}
        scrollToIndex={scrollToIndex}
        scrollToAlignment={scrollToAlignment}
        containerRole={role}
        containerProps={{
          onKeyDown: this.handleKeyDown,
          "data-testid": testId,
        }}
        rowRenderer={({ key, index, parent, style }) => {
          return (
            <CellMeasurer
              cache={this._cache}
              columnIndex={0}
              key={key}
              rowIndex={index}
              parent={parent}
            >
              {() => (
                <AccordionListCell<T>
                  hasCursor={this.isRowSelected(rows[index])}
                  {...itemProps}
                  style={style}
                  row={rows[index]}
                  sections={sections}
                  onChange={this.handleChange}
                  searchText={this.state.searchText}
                  onChangeSearchText={this.handleChangeSearchText}
                  sectionIsExpanded={this.isSectionExpanded}
                  canToggleSections={this.canToggleSections()}
                  toggleSection={this.toggleSection}
                  withBorders={withBorders}
                />
              )}
            </CellMeasurer>
          );
        }}
        onRowsRendered={({ startIndex, stopIndex }) => {
          this._startIndex = startIndex;
          this._stopIndex = stopIndex;

          if (searchRowIndex < startIndex || searchRowIndex > stopIndex) {
            this.handleSearchRemoval();
          }
        }}
      />
    );
  }
}
