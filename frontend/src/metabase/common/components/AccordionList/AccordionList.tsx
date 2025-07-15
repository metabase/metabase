import cx from "classnames";
import {
  type CSSProperties,
  Component,
  type KeyboardEvent,
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

import { Box } from "metabase/ui";

import S from "./AccordionList.module.css";
import {
  AccordionListCell,
  type SharedAccordionProps,
} from "./AccordionListCell";
import type { Item, Row, SearchProps, Section } from "./types";
import {
  type Cursor,
  getNextCursor,
  getPrevCursor,
  searchFilter,
} from "./utils";

type Props<
  TItem extends Item,
  TSection extends Section<TItem> = Section<TItem>,
> = SharedAccordionProps<TItem, TSection> & {
  "data-testid"?: string | null;
  alwaysTogglable?: boolean;
  className?: string;
  globalSearch?: boolean;
  hasInitialFocus?: boolean;
  hideSingleSectionTitle?: boolean;
  initiallyOpenSection?: number | null;
  id?: string;
  onChange?: (item: TItem) => void;
  onChangeSection?: (section: TSection, sectionIndex: number) => boolean | void;
  onChangeSearchText?: (searchText: string) => void;
  openSection?: number;
  role?: string;
  searchProp?: SearchProps<TItem>;
  searchable?: boolean | ((section: Section) => boolean | undefined);
  fuzzySearch?: boolean;
  sections: TSection[];
  style?: CSSProperties;

  // TODO: pass width to this component as solely number or string if possible
  // currently prop is number on initialization, then string afterwards
  width?: string | number;
  maxHeight?: number;
};

type State = {
  openSection: number | null;
  searchText: string;
  cursor: Cursor | null;
  scrollToAlignment: Alignment;
};

export class AccordionList<
  TItem extends Item,
  TSection extends Section<TItem> = Section<TItem>,
> extends Component<Props<TItem, TSection>, State> {
  _cache: CellMeasurerCache;

  listRef: RefObject<List>;
  listRootRef: RefObject<HTMLDivElement>;

  _initialSelectedRowIndex?: number;
  _startIndex?: number;
  _stopIndex?: number;
  _forceUpdateTimeout?: NodeJS.Timeout | null;

  constructor(props: Props<TItem, TSection>, context: unknown) {
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
    this.listRef = createRef();
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
        this.listRef.current &&
        index != null &&
        this._startIndex != null &&
        this._stopIndex != null &&
        !(index >= this._startIndex && index <= this._stopIndex)
      ) {
        this.listRef.current?.scrollToRow(index);
      }
    }, 0);
  }

  componentDidUpdate(_prevProps: Props<TItem, TSection>, prevState: State) {
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
        this.listRef.current?.Grid?._scrollingContainer
      : this.listRootRef.current;

    return element ?? null;
  }

  // resets the row height cache when the displayed rows change
  _clearRowHeightCache() {
    this._cache.clearAll();
    this._forceUpdateList();

    // NOTE: unclear why this needs to be async
    this._forceUpdateTimeout = setTimeout(() => {
      this._forceUpdateTimeout = null;
      this._forceUpdateList();
    });
  }

  _forceUpdateList() {
    if (this.listRef.current) {
      // NOTE: unclear why this particular set of functions works, but it does
      this.listRef.current.invalidateCellSizeAfterRender({
        columnIndex: 0,
        rowIndex: 0,
      });
      this.listRef.current.forceUpdateGrid();
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
    const { sections } = this.props;
    if (sections.length === 1) {
      return 0;
    }

    let { openSection } = this.state;
    if (openSection === undefined) {
      for (const [index, section] of sections.entries()) {
        if (this.sectionIsSelected(section, index)) {
          openSection = index;
          break;
        }
      }
    }
    return openSection;
  }

  sectionIsSelected(_section: Section, sectionIndex: number) {
    const { sections, itemIsSelected } = this.props;
    let selectedSection = null;
    for (let i = 0; i < sections.length; i++) {
      if (
        _.some(sections[i]?.items ?? [], (item) =>
          Boolean(itemIsSelected?.(item, i)),
        )
      ) {
        selectedSection = i;
        break;
      }
    }
    return selectedSection === sectionIndex;
  }

  handleChange = (item: TItem) => {
    this.props.onChange?.(item);
  };

  handleChangeSearchText = (searchText: string) => {
    this.setState({ searchText, cursor: null });
    this.props.onChangeSearchText?.(searchText);
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
        if (item && itemIsSelected(item, itemIndex)) {
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
    const { searchText } = this.state;
    if (searchText.length === 0) {
      return this.getFirstSelectedItemCursor();
    }

    return null;
  };

  handleKeyDown = (event: KeyboardEvent) => {
    if (event.nativeEvent.isComposing) {
      return;
    }

    const { cursor } = this.state;
    if (event.key === "ArrowUp") {
      event.preventDefault();

      const prevCursor = getPrevCursor(
        cursor ?? this.getInitialCursor(),
        this.getRows(),
        this.canSelectSection,
      );

      return this.setState({
        cursor: prevCursor,
        scrollToAlignment: "auto",
      });
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      const nextCursor = getNextCursor(
        cursor ?? this.getInitialCursor(),
        this.getRows(),
        this.canSelectSection,
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
  };

  getRows = (): Row<TItem, TSection>[] => {
    const {
      alwaysTogglable = false,
      alwaysExpanded = false,
      hideSingleSectionTitle = false,
      itemIsSelected = () => false,
      searchable = (section: TSection) =>
        section?.items && section.items.length > 10,
      sections,
      searchProp,
      fuzzySearch,
    } = this.props;
    const { searchText } = this.state;

    const openSection = this.getOpenSection();
    const isSearching = searchText.length > 0;

    // if any section is searchable just enable a global search
    let globalSearch = this.props.globalSearch ?? false;

    const sectionIsExpanded = (sectionIndex: number) =>
      alwaysExpanded ||
      openSection === sectionIndex ||
      (globalSearch && isSearching);

    const sectionIsSearchable = (sectionIndex: number) =>
      typeof searchable === "function"
        ? searchable(sections[sectionIndex])
        : searchable;

    const rows: Row<TItem, TSection>[] = [];

    const sortedSections = searchFilter({
      sections,
      searchText,
      fuzzySearch,
      searchProp,
    });

    for (const { section, sectionIndex, items } of sortedSections) {
      const isLastSection = sectionIndex === sections.length - 1;

      if (
        section.name &&
        (!hideSingleSectionTitle || sections.length > 1 || alwaysTogglable)
      ) {
        if (
          !searchable ||
          !globalSearch ||
          items?.length > 0 ||
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
        for (const { itemIndex, item } of items) {
          const isLastItem = itemIndex === section.items.length - 1;
          if (itemIsSelected(item, itemIndex)) {
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
      const isEmpty = rows.filter((row) => row.type === "item").length === 0;

      if (isSearching && isEmpty) {
        rows.unshift({
          type: "no-results",
          section: {} as TSection,
          sectionIndex: 0,
          isLastSection: false,
        });
      }

      rows.unshift({
        type: "search",
        section: {} as TSection,
        sectionIndex: 0,
        isLastSection: false,
      });
    }

    return rows;
  };

  isVirtualized = () => false;

  canToggleSections = () => {
    const { alwaysTogglable, sections } = this.props;
    return alwaysTogglable || sections.length > 1;
  };

  isRowSelected = (row: Row<TItem, TSection>) => {
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
    const { globalSearch, alwaysExpanded } = this.props;
    const openSection = this.getOpenSection();

    return Boolean(
      alwaysExpanded ||
        openSection === sectionIndex ||
        (globalSearch && this.state.searchText.length > 0),
    );
  };

  canSelectSection = (sectionIndex: number) => {
    const { globalSearch, alwaysExpanded, sections } = this.props;
    const section = sections[sectionIndex];
    if (!section) {
      return false;
    }

    if (section.type === "action") {
      return true;
    }

    return (
      !alwaysExpanded && !(globalSearch && this.state.searchText.length > 0)
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
      maxHeight = Infinity,

      alwaysExpanded = false,
    } = this.props;
    const { cursor, scrollToAlignment } = this.state;

    const rows = this.getRows();

    const scrollToIndex =
      cursor != null ? rows.findIndex(this.isRowSelected) : undefined;

    const searchRowIndex = rows.findIndex((row) => row.type === "search");
    const hasSearch = searchRowIndex >= 0;

    if (!this.isVirtualized()) {
      return (
        <Box
          className={cx(S.accordionListRoot, className, {
            [S.hasSearch]: hasSearch,
          })}
          ref={this.listRootRef}
          role="tree"
          onKeyDown={this.handleKeyDown}
          tabIndex={-1}
          style={{
            width,
            ...style,
          }}
          data-testid={testId}
        >
          {rows.map((row, index) => (
            <AccordionListCell<TItem, TSection>
              key={index}
              {...this.props}
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
        </Box>
      );
    }

    const max =
      maxHeight > 0 && maxHeight < Infinity ? maxHeight : window.innerHeight;

    const height = Math.min(
      max,
      rows.reduce(
        (height, _row, index) => height + this._cache.rowHeight({ index }),
        0,
      ),
    );

    return (
      <List
        id={id}
        ref={this.listRef}
        className={cx(className, { [S.hasSearch]: hasSearch })}
        style={{
          // HACK - Ensure the component can scroll
          // This is a temporary fix to handle cases where the parent component doesn’t pass in the correct `maxHeight`
          overflowY: "auto",
          outline: "none",
          maxWidth: width,
          maxHeight,
          ...style,
        }}
        containerStyle={{
          pointerEvents: "auto",
          overflow: "auto",
          maxHeight: "inherit",
        }}
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
        rowRenderer={({ key, index, parent, style }) => (
          <CellMeasurer
            cache={this._cache}
            columnIndex={0}
            key={key}
            rowIndex={index}
            parent={parent}
          >
            {({ registerChild }) => (
              <AccordionListCell<TItem, TSection>
                ref={registerChild}
                hasCursor={this.isRowSelected(rows[index])}
                {...this.props}
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
        )}
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
