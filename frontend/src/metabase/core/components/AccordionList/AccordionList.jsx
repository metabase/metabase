import React, { Component } from "react";
import PropTypes from "prop-types";
import { List, CellMeasurer, CellMeasurerCache } from "react-virtualized";

import _ from "underscore";
import { getIn } from "icepick";

import Icon from "metabase/components/Icon";
import { memoize } from "metabase-lib/lib/utils";
import { AccordionListCell } from "./AccordionListCell";
import { AccordionListRoot } from "./AccordionList.styled";

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
    };

    this._cache = new CellMeasurerCache({
      fixedWidth: true,
      minHeight: 10,
    });

    this.containerRef = React.createRef();
  }

  static propTypes = {
    style: PropTypes.object,
    className: PropTypes.string,
    id: PropTypes.string,

    // TODO: pass width to this component as solely number or string if possible
    // currently prop is number on initialization, then string afterwards
    width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    maxHeight: PropTypes.number,

    sections: PropTypes.array.isRequired,

    initiallyOpenSection: PropTypes.number,
    openSection: PropTypes.number,
    onChange: PropTypes.func,
    onChangeSection: PropTypes.func,

    // section getters/render props
    renderSectionIcon: PropTypes.func,
    renderSectionExtra: PropTypes.func,

    // item getters/render props
    itemIsSelected: PropTypes.func,
    itemIsClickable: PropTypes.func,
    renderItemName: PropTypes.func,
    renderItemDescription: PropTypes.func,
    renderItemIcon: PropTypes.func,
    renderItemExtra: PropTypes.func,
    renderItemWrapper: PropTypes.func,
    getItemClassName: PropTypes.func,

    alwaysTogglable: PropTypes.bool,
    alwaysExpanded: PropTypes.bool,
    hideSingleSectionTitle: PropTypes.bool,
    showItemArrows: PropTypes.bool,

    searchable: PropTypes.oneOfType([PropTypes.bool, PropTypes.func]),
    searchProp: PropTypes.oneOfType([PropTypes.string, PropTypes.array]),
    searchCaseInsensitive: PropTypes.bool,
    searchFuzzy: PropTypes.bool,
    searchPlaceholder: PropTypes.string,

    itemTestId: PropTypes.string,
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

    // section getters/render props
    renderSectionIcon: section =>
      section.icon && <Icon name={section.icon} size={18} />,
    renderSectionExtra: () => null,

    // item getters/render props
    itemIsClickable: item => true,
    itemIsSelected: item => false,
    renderItemName: item => item.name,
    renderItemDescription: item => item.description,
    renderItemExtra: item => null,
    renderItemIcon: item => item.icon && <Icon name={item.icon} size={18} />,
    getItemClassName: item => item.className,
  };

  componentDidMount() {
    this.containerRef?.current?.focus();
    // NOTE: for some reason the row heights aren't computed correctly when
    // first rendering, so force the list to update
    this._forceUpdateList();
    // `scrollToRow` upon mounting, after _forceUpdateList
    // Use list.scrollToRow instead of the scrollToIndex prop since the
    // causes the list's scrolling to be pinned to the selected row
    setTimeout(() => {
      const index = this._initialSelectedRowIndex;

      this.setState({ cursor: index ?? 0 });

      if (
        this._list &&
        index != null &&
        !(index >= this._startIndex && index <= this._stopIndex)
      ) {
        this._list.scrollToRow(this._initialSelectedRowIndex);
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
    this.setState({ searchText });
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

  findClosestItemRow = (currentIndex, order) => {
    const rows = this.getRows();

    let index = order === "next" ? currentIndex + 1 : currentIndex - 1;

    while (index >= 0 && index < rows.length) {
      if (
        rows[index].type === "item" ||
        (rows[index].type === "header" && !this.props.alwaysExpanded)
      ) {
        return index;
      }

      if (order === "next") {
        index++;
      } else {
        index--;
      }
    }

    return null;
  };

  handleKeyDown = event => {
    event.preventDefault();
    event.stopPropagation();

    if (event.key === "ArrowUp") {
      return this.setState(prev => ({
        cursor: this.findClosestItemRow(prev.cursor, "prev") ?? prev.cursor,
      }));
    }

    if (event.key === "ArrowDown") {
      return this.setState(prev => ({
        cursor: this.findClosestItemRow(prev.cursor, "next") ?? prev.cursor,
      }));
    }

    if (event.key === " " || event.key === "Enter") {
      const focusedRow = this.getRows()[this.state.cursor];

      if (focusedRow.type === "header" && this.canToggleSections()) {
        this.toggleSection(focusedRow.sectionIndex);
        return;
      }

      if (focusedRow.type === "item") {
        this.props.onChange(focusedRow.item);
      }
    }
  };

  @memoize
  getRowsCached = (
    searchText,
    searchable,
    searchProp,
    sections,
    alwaysTogglable,
    alwaysExpanded,
    hideSingleSectionTitle,
    itemIsSelected,
    openSection,
  ) => {
    const sectionIsExpanded = sectionIndex =>
      alwaysExpanded || openSection === sectionIndex;
    const sectionIsSearchable = sectionIndex =>
      searchable &&
      (typeof searchable !== "function" || searchable(sections[sectionIndex]));

    let searchFilter = () => true;
    if (searchText) {
      searchFilter = item => {
        if (typeof searchProp === "string") {
          return this.searchPredicate(item, searchProp);
        } else if (Array.isArray(searchProp)) {
          const searchResults = searchProp.map(member =>
            this.searchPredicate(item, member),
          );
          return searchResults.reduce((acc, curr) => acc || curr);
        }
      };
    }

    // if any section is searchable just enable a global search
    let globalSearch = false;

    const rows = [];
    for (const [sectionIndex, section] of sections.entries()) {
      const isLastSection = sectionIndex === sections.length - 1;
      if (
        section.name &&
        (!hideSingleSectionTitle || sections.length > 1 || alwaysTogglable)
      ) {
        rows.push({
          type: "header",
          section,
          sectionIndex,
          isLastSection,
        });
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
      searchProp,
      sections,
      alwaysTogglable,
      alwaysExpanded,
      hideSingleSectionTitle,
      itemIsSelected,
    } = this.props;

    const { searchText } = this.state;

    const openSection = this.getOpenSection();

    return this.getRowsCached(
      searchText,
      searchable,
      searchProp,
      sections,
      alwaysTogglable,
      alwaysExpanded,
      hideSingleSectionTitle,
      itemIsSelected,
      openSection,
    );
  }

  canToggleSections = () => {
    const { alwaysTogglable, sections } = this.props;
    return alwaysTogglable || sections.length > 1;
  };

  render() {
    const { id, style, className, sections, alwaysExpanded } = this.props;

    const openSection = this.getOpenSection();
    const sectionIsExpanded = sectionIndex =>
      alwaysExpanded || openSection === sectionIndex;

    const rows = this.getRows();

    if (this.props.maxHeight === Infinity) {
      return (
        <AccordionListRoot
          innerRef={this.containerRef}
          onKeyDown={this.handleKeyDown}
          tabIndex={0}
          className={className}
          style={{
            width: this.props.width,
            ...style,
          }}
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
              sectionIsExpanded={sectionIsExpanded}
              canToggleSections={this.canToggleSections()}
              toggleSection={this.toggleSection}
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
    };

    return (
      <AccordionListRoot
        innerRef={this.containerRef}
        onKeyDown={this.handleKeyDown}
        tabIndex={0}
      >
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
          // ensure `scrollToRow` scrolls the row to the top of the list
          scrollToAlignment="start"
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
                    hasCursor={this.state.cursor === index}
                    {...this.props}
                    style={style}
                    row={rows[index]}
                    sections={sections}
                    onChange={this.handleChange}
                    searchText={this.state.searchText}
                    onChangeSearchText={this.handleChangeSearchText}
                    sectionIsExpanded={sectionIsExpanded}
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
          }}
        />
      </AccordionListRoot>
    );
  }
}
