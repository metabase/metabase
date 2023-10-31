import { Component } from "react";
import ReactDOM from "react-dom";
import PropTypes from "prop-types";
import { List, CellMeasurer, CellMeasurerCache } from "react-virtualized";

import _ from "underscore";
import { getIn } from "icepick";

import { Icon } from "metabase/core/components/Icon";
import { AccordionListCell } from "./AccordionListCell";
import { AccordionListRoot } from "./AccordionList.styled";
import { getNextCursor, getPrevCursor } from "./utils";

export default class AccordionList extends Component {
  constructor(props, context) {
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
  }

  static propTypes = {
    style: PropTypes.object,
    className: PropTypes.string,
    id: PropTypes.string,

    // TODO: pass width to this component as solely number or string if possible
    // currently prop is number on initialization, then string afterwards
    width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    maxHeight: PropTypes.number,

    role: PropTypes.string,

    sections: PropTypes.array.isRequired,

    initiallyOpenSection: PropTypes.number,
    openSection: PropTypes.number,
    onChange: PropTypes.func,
    onChangeSection: PropTypes.func,

    // section getters/render props
    renderSectionIcon: PropTypes.func,
    renderSearchSection: PropTypes.func,

    // item getters/render props
    itemIsSelected: PropTypes.func,
    itemIsClickable: PropTypes.func,
    renderItemName: PropTypes.func,
    renderItemDescription: PropTypes.func,
    renderItemIcon: PropTypes.func,
    renderItemExtra: PropTypes.func,
    renderItemWrapper: PropTypes.func,
    getItemClassName: PropTypes.func,
    getItemStyles: PropTypes.func,

    alwaysTogglable: PropTypes.bool,
    alwaysExpanded: PropTypes.bool,
    hideSingleSectionTitle: PropTypes.bool,
    showSpinner: PropTypes.func,
    showItemArrows: PropTypes.bool,

    searchable: PropTypes.oneOfType([PropTypes.bool, PropTypes.func]),
    searchProp: PropTypes.oneOfType([PropTypes.string, PropTypes.array]),
    searchCaseInsensitive: PropTypes.bool,
    searchFuzzy: PropTypes.bool,
    searchPlaceholder: PropTypes.string,
    searchInputProps: PropTypes.object,
    hideEmptySectionsInSearch: PropTypes.bool,
    hasInitialFocus: PropTypes.bool,

    itemTestId: PropTypes.string,
    "data-testid": PropTypes.string,
  };

  static defaultProps = {
    style: {},
    width: 300,
    searchable: section => section.items && section.items.length > 10,
    searchProp: "name",
    searchCaseInsensitive: true,
    searchFuzzy: true,
    alwaysTogglable: false,
    alwaysExpanded: false,
    hideSingleSectionTitle: false,
    hideEmptySectionsInSearch: false,
    role: "grid",

    // section getters/render props
    renderSectionIcon: section => section.icon && <Icon name={section.icon} />,

    // item getters/render props
    itemIsClickable: item => true,
    itemIsSelected: item => false,
    renderItemName: item => item.name,
    renderItemDescription: item => item.description,
    renderItemExtra: item => null,
    renderItemIcon: item => item.icon && <Icon name={item.icon} />,
    getItemClassName: item => item.className,
    getItemStyles: item => {},
    hasInitialFocus: true,
    showSpinner: _item => false,
  };

  componentDidMount() {
    this.container = ReactDOM.findDOMNode(this);

    // NOTE: for some reason the row heights aren't computed correctly when
    // first rendering, so force the list to update
    this._forceUpdateList();
    // `scrollToRow` upon mounting, after _forceUpdateList
    // Use list.scrollToRow instead of the scrollToIndex prop since the
    // causes the list's scrolling to be pinned to the selected row
    setTimeout(() => {
      const hasFocusedChildren = this.container.contains(
        document.activeElement,
      );
      if (!hasFocusedChildren && this.props.hasInitialFocus) {
        this.container.focus();
      }

      const index = this._initialSelectedRowIndex;

      if (
        this._list &&
        index != null &&
        !(index >= this._startIndex && index <= this._stopIndex)
      ) {
        this._list.scrollToRow(index);
      }
    }, 0);
  }

  componentDidUpdate(prevProps, prevState) {
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
      this._list.invalidateCellSizeAfterRender({
        columnIndex: 0,
        rowIndex: 0,
      });
      this._list.forceUpdateGrid();
      this.forceUpdate();
    }
  }

  toggleSection = sectionIndex => {
    const { sections, onChangeSection } = this.props;
    if (onChangeSection) {
      if (onChangeSection(sections[sectionIndex], sectionIndex) === false) {
        return;
      }
    }

    const openSection = this.getOpenSection();
    if (openSection === sectionIndex) {
      sectionIndex = null;
    }
    this.setState({ openSection: sectionIndex });
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

  sectionIsSelected(_section, sectionIndex) {
    const { sections } = this.props;
    let selectedSection = null;
    for (let i = 0; i < sections.length; i++) {
      if (_.some(sections[i].items, item => this.props.itemIsSelected(item))) {
        selectedSection = i;
        break;
      }
    }
    return selectedSection === sectionIndex;
  }

  handleChange = item => {
    if (this.props.onChange) {
      this.props.onChange(item);
    }
  };

  handleChangeSearchText = searchText => {
    this.setState({ searchText, cursor: null });
  };

  searchPredicate = (item, searchPropMember) => {
    const { searchCaseInsensitive, searchFuzzy } = this.props;
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

  checkSectionHasItemsMatchingSearch = (section, searchFilter) => {
    return section.items.filter(searchFilter).length > 0;
  };

  getFirstSelectedItemCursor = () => {
    const { sections, itemIsSelected } = this.props;

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex];
      for (let itemIndex = 0; itemIndex < section.items?.length; itemIndex++) {
        const item = section.items[itemIndex];
        if (itemIsSelected(item)) {
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

  handleKeyDown = event => {
    if (event.key === "ArrowUp") {
      event.preventDefault();

      const prevCursor = getPrevCursor(
        this.getInitialCursor(),
        this.props.sections,
        this.isSectionExpanded,
        !this.props.alwaysExpanded,
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
        !this.props.alwaysExpanded,
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
        const item = sections[cursor.sectionIndex].items[cursor.itemIndex];

        this.props.onChange(item);
        return;
      }

      this.toggleSection(cursor.sectionIndex);
    }

    const searchRow = this.getRows().findIndex(row => row.type === "search");

    if (searchRow >= 0 && this.isVirtualized()) {
      this._list.scrollToRow(searchRow);
    }
  };

  searchFilter = item => {
    const { searchProp } = this.props;
    const { searchText } = this.state;

    if (!searchText || searchText.length === 0) {
      return true;
    }

    if (typeof searchProp === "string") {
      return this.searchPredicate(item, searchProp);
    } else if (Array.isArray(searchProp)) {
      const searchResults = searchProp.map(member =>
        this.searchPredicate(item, member),
      );
      return searchResults.reduce((acc, curr) => acc || curr);
    }
  };

  getRowsCached = (
    searchFilter,
    searchable,
    sections,
    alwaysTogglable,
    alwaysExpanded,
    hideSingleSectionTitle,
    itemIsSelected,
    hideEmptySectionsInSearch,
    openSection,
  ) => {
    const sectionIsExpanded = sectionIndex =>
      alwaysExpanded || openSection === sectionIndex;
    const sectionIsSearchable = sectionIndex =>
      searchable &&
      (typeof searchable !== "function" || searchable(sections[sectionIndex]));

    // if any section is searchable just enable a global search
    let globalSearch = false;

    const rows = [];
    for (const [sectionIndex, section] of sections.entries()) {
      const isLastSection = sectionIndex === sections.length - 1;
      if (
        section.name &&
        (!hideSingleSectionTitle || sections.length > 1 || alwaysTogglable)
      ) {
        if (
          !searchable ||
          !hideEmptySectionsInSearch ||
          this.checkSectionHasItemsMatchingSearch(section, searchFilter)
        ) {
          rows.push({
            type: "header",
            section,
            sectionIndex,
            isLastSection,
          });
        }
      } else {
        rows.push({
          type: "header-hidden",
          section,
          sectionIndex,
          isLastSection,
        });
      }
      if (
        sectionIsSearchable(sectionIndex) &&
        sectionIsExpanded(sectionIndex) &&
        section.items &&
        section.items.length > 0 &&
        !section.loading
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
      rows.unshift({
        type: "search",
        section: {},
        sectionIndex: 0,
        isLastSection: false,
      });
    }

    return rows;
  };

  getRows() {
    const {
      searchable,
      sections,
      alwaysTogglable,
      alwaysExpanded,
      hideSingleSectionTitle,
      itemIsSelected,
      hideEmptySectionsInSearch,
    } = this.props;

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
    );
  }

  isVirtualized = () => this.props.maxHeight !== Infinity;

  canToggleSections = () => {
    const { alwaysTogglable, sections } = this.props;
    return alwaysTogglable || sections.length > 1;
  };

  isRowSelected = row => {
    if (!this.state.cursor) {
      return false;
    }

    const { sectionIndex, itemIndex } = this.state.cursor;
    return (
      row.sectionIndex === sectionIndex &&
      (row.itemIndex === itemIndex ||
        (itemIndex == null && row.itemIndex == null))
    );
  };

  isSectionExpanded = sectionIndex => {
    const openSection = this.getOpenSection();

    return this.props.alwaysExpanded || openSection === sectionIndex;
  };

  // Because of virtualization, focused search input can be removed which does not trigger blur event.
  // We need to restore focus on the component root container to make keyboard navigation working
  handleSearchRemoval = () => {
    this.container?.focus();
  };

  render() {
    const {
      id,
      style,
      className,
      sections,
      role,
      "data-testid": testId,
    } = this.props;
    const { cursor, scrollToAlignment } = this.state;

    const rows = this.getRows();

    const scrollToIndex =
      cursor != null ? rows.findIndex(this.isRowSelected) : undefined;

    const searchRowIndex = rows.findIndex(row => row.type === "search");

    if (!this.isVirtualized()) {
      return (
        <AccordionListRoot
          role="tree"
          onKeyDown={this.handleKeyDown}
          tabIndex={-1}
          className={className}
          style={{
            width: this.props.width,
            ...style,
          }}
          data-testid={testId}
        >
          {rows.map((row, index) => (
            <AccordionListCell
              key={index}
              {...this.props}
              row={row}
              sections={sections}
              onChange={this.handleChange}
              searchText={this.state.searchText}
              onChangeSearchText={this.handleChangeSearchText}
              sectionIsExpanded={this.isSectionExpanded}
              canToggleSections={this.canToggleSections()}
              toggleSection={this.toggleSection}
              hasCursor={this.isRowSelected(rows[index])}
            />
          ))}
        </AccordionListRoot>
      );
    }

    const maxHeight =
      this.props.maxHeight > 0 && this.props.maxHeight < Infinity
        ? this.props.maxHeight
        : window.innerHeight;

    const width = this.props.width;
    const height = Math.min(
      maxHeight,
      rows.reduce(
        (height, row, index) => height + this._cache.rowHeight({ index }),
        0,
      ),
    );

    const defaultListStyle = {
      // HACK - Ensure the component can scroll
      // This is a temporary fix to handle cases where the parent component doesn’t pass in the correct `maxHeight`
      overflowY: "auto",
      outline: "none",
    };

    return (
      <List
        id={id}
        ref={list => (this._list = list)}
        className={className}
        style={{ ...defaultListStyle, ...style }}
        containerStyle={{ pointerEvents: "auto" }}
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
              {({ measure }) => (
                <AccordionListCell
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
