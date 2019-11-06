import React, { Component } from "react";
import PropTypes from "prop-types";

import cx from "classnames";
import _ from "underscore";
import { color } from "metabase/lib/colors";

import Icon from "metabase/components/Icon";
import ListSearchField from "metabase/components/ListSearchField";
import { List, CellMeasurer, CellMeasurerCache } from "react-virtualized";

export type RenderItemWrapper = (
  item: any,
  itemIndex: number,
  children?: any,
) => React$Element;

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
    sections: PropTypes.array.isRequired,
    searchable: PropTypes.oneOfType([PropTypes.bool, PropTypes.func]),
    initiallyOpenSection: PropTypes.number,
    openSection: PropTypes.number,
    onChange: PropTypes.func,
    onChangeSection: PropTypes.func,
    itemIsSelected: PropTypes.func,
    itemIsClickable: PropTypes.func,
    renderItem: PropTypes.func,
    renderSectionIcon: PropTypes.func,
    renderItemWrapper: PropTypes.func,
    getItemClassName: PropTypes.func,
    alwaysTogglable: PropTypes.bool,
    alwaysExpanded: PropTypes.bool,
    hideSingleSectionTitle: PropTypes.bool,
    showItemArrows: PropTypes.bool,
    searchPlaceholder: PropTypes.string,
  };

  static defaultProps = {
    style: {},
    width: 300,
    searchable: section => section.items && section.items.length > 10,
    alwaysTogglable: false,
    alwaysExpanded: false,
    hideSingleSectionTitle: false,
  };

  componentDidMount() {
    // NOTE: for some reason the row heights aren't computed correctly when
    // first rendering, so force the list to update
    this._forceUpdateList();
    // `scrollToRow` upon mounting, after _forceUpdateList
    // Use list.scrollToRow instead of the scrollToIndex prop since the
    // causes the list's scrolling to be pinned to the selected row
    setTimeout(() => {
      if (this._initialSelectedRowIndex != null && this._list) {
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

  sectionIsSelected(section, sectionIndex) {
    const { sections } = this.props;
    let selectedSection = null;
    for (let i = 0; i < sections.length; i++) {
      if (_.some(sections[i].items, item => this.itemIsSelected(item))) {
        selectedSection = i;
        break;
      }
    }
    return selectedSection === sectionIndex;
  }

  itemIsClickable = item => {
    if (this.props.itemIsClickable) {
      return this.props.itemIsClickable(item);
    } else {
      return true;
    }
  };

  itemIsSelected = item => {
    if (this.props.itemIsSelected) {
      return this.props.itemIsSelected(item);
    } else {
      return false;
    }
  };

  handleChange = item => {
    if (this.props.onChange) {
      this.props.onChange(item);
    }
  };

  handleChangeSearchText = searchText => {
    this.setState({ searchText });
  };

  renderItemExtra = (item, itemIndex, isSelected) => {
    if (this.props.renderItemExtra) {
      return this.props.renderItemExtra(item, itemIndex, isSelected);
    } else {
      return null;
    }
  };

  renderItemIcon = (item, itemIndex) => {
    if (this.props.renderItemIcon) {
      return this.props.renderItemIcon(item, itemIndex);
    } else if (item.icon) {
      return <Icon className="Icon text-default" name={item.icon} size={18} />;
    } else {
      return null;
    }
  };

  renderSectionIcon = (section, sectionIndex) => {
    if (this.props.renderSectionIcon) {
      return (
        <span className="List-section-icon mr1 flex align-center">
          {this.props.renderSectionIcon(section, sectionIndex)}
        </span>
      );
    } else if (section.icon) {
      return (
        <span className="List-section-icon mr1 flex align-center">
          <Icon name={section.icon} size={18} />
        </span>
      );
    } else {
      return null;
    }
  };

  renderItemWrapper = (item, itemIndex, children) => {
    if (this.props.renderItemWrapper) {
      return this.props.renderItemWrapper(item, itemIndex, children);
    } else {
      return children;
    }
  };

  getItemClassName = (item, itemIndex) => {
    if (this.props.getItemClassName) {
      return this.props.getItemClassName(item, itemIndex);
    } else {
      return item.className;
    }
  };

  render() {
    const {
      id,
      style,
      className,
      searchable,
      sections,
      alwaysTogglable,
      alwaysExpanded,
      hideSingleSectionTitle,
    } = this.props;
    const { searchText } = this.state;

    const openSection = this.getOpenSection();
    const sectionIsExpanded = sectionIndex =>
      alwaysExpanded || openSection === sectionIndex;
    const sectionIsSearchable = sectionIndex =>
      searchable &&
      (typeof searchable !== "function" || searchable(sections[sectionIndex]));
    const sectionIsTogglable = sectionIndex =>
      alwaysTogglable || sections.length > 1;

    // if any section is searchable just enable a global search
    let globalSearch = false;

    const rows = [];
    for (const [sectionIndex, section] of sections.entries()) {
      const isLastSection = sectionIndex === sections.length - 1;
      if (
        section.name &&
        (!hideSingleSectionTitle || sections.length > 1 || alwaysTogglable)
      ) {
        rows.push({ type: "header", section, sectionIndex, isLastSection });
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
        section.items.length > 0
      ) {
        if (alwaysExpanded) {
          globalSearch = true;
        } else {
          rows.push({ type: "search", section, sectionIndex, isLastSection });
        }
      }
      if (
        sectionIsExpanded(sectionIndex) &&
        section.items &&
        section.items.length > 0
      ) {
        for (const [itemIndex, item] of section.items.entries()) {
          if (
            !searchText ||
            item.name.toLowerCase().includes(searchText.toLowerCase())
          ) {
            const isLastItem = itemIndex === section.items.length - 1;
            if (this.itemIsSelected(item)) {
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
    }

    if (globalSearch) {
      rows.unshift({
        type: "search",
        section: {},
        sectionIndex: 0,
        isLastSection: false,
      });
    }

    if (this.props.maxHeight === Infinity) {
      return (
        <div
          className={className}
          style={{
            width: this.props.width,
            ...style,
          }}
        >
          {rows.map(row => (
            <AccordionListCell
              {...this.props}
              row={row}
              sections={sections}
              onChange={this.handleChange}
              searchText={this.state.searchText}
              onChangeSearchText={this.handleChangeSearchText}
              itemIsSelected={this.itemIsSelected}
              itemIsClickable={this.itemIsClickable}
              sectionIsExpanded={sectionIsExpanded}
              sectionIsTogglable={sectionIsTogglable}
              toggleSection={this.toggleSection}
              renderSectionIcon={this.renderSectionIcon}
              renderItemWrapper={this.renderItemWrapper}
              renderItemIcon={this.renderItemIcon}
              renderItemExtra={this.renderItemExtra}
              getItemClassName={this.getItemClassName}
            />
          ))}
        </div>
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
      overflowY: "scroll",
    };

    return (
      <List
        id={id}
        ref={list => (this._list = list)}
        className={className}
        style={{ ...defaultListStyle, ...style }}
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
                  {...this.props}
                  style={style}
                  row={rows[index]}
                  sections={sections}
                  onChange={this.handleChange}
                  searchText={this.state.searchText}
                  onChangeSearchText={this.handleChangeSearchText}
                  itemIsSelected={this.itemIsSelected}
                  itemIsClickable={this.itemIsClickable}
                  sectionIsExpanded={sectionIsExpanded}
                  sectionIsTogglable={sectionIsTogglable}
                  toggleSection={this.toggleSection}
                  renderSectionIcon={this.renderSectionIcon}
                  renderItemWrapper={this.renderItemWrapper}
                  renderItemIcon={this.renderItemIcon}
                  renderItemExtra={this.renderItemExtra}
                  getItemClassName={this.getItemClassName}
                />
              )}
            </CellMeasurer>
          );
        }}
      />
    );
  }
}

const AccordionListCell = ({
  style,
  sections,
  row,
  onChange,
  itemIsSelected,
  itemIsClickable,
  sectionIsExpanded,
  sectionIsTogglable,
  alwaysExpanded,
  toggleSection,
  renderSectionIcon,
  renderItemWrapper,
  renderItemIcon,
  renderItemExtra,
  searchText,
  onChangeSearchText,
  searchPlaceholder,
  showItemArrows,
  getItemClassName,
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
      content = (
        <div
          className={cx(
            "List-section-header mx2 py2 flex align-center hover-parent hover--opacity",
            {
              "cursor-pointer": sectionIsTogglable(sectionIndex),
              "text-brand": sectionIsExpanded(sectionIndex),
            },
          )}
          onClick={
            sectionIsTogglable(sectionIndex) &&
            (() => toggleSection(sectionIndex))
          }
        >
          {renderSectionIcon(section, sectionIndex)}
          <h3 className="List-section-title text-wrap">{section.name}</h3>
          {sections.length > 1 && section.items && section.items.length > 0 && (
            <span className="flex-align-right hover-child">
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
  } else if (type === "search") {
    content = (
      <ListSearchField
        className="bg-white m1"
        onChange={onChangeSearchText}
        searchText={searchText}
        placeholder={searchPlaceholder}
        autoFocus
      />
    );
  } else if (type === "item") {
    const isSelected = itemIsSelected(item, itemIndex);
    const isClickable = itemIsClickable(item, itemIndex);
    content = renderItemWrapper(
      item,
      itemIndex,
      <div
        className={cx(
          "List-item flex mx1",
          {
            "List-item--selected": isSelected,
            "List-item--disabled": !isClickable,
            mb1: isLastItem,
          },
          getItemClassName(item, itemIndex),
        )}
      >
        <a
          className={cx(
            "p1 flex-auto flex align-center",
            isClickable ? "cursor-pointer" : "cursor-default",
          )}
          onClick={isClickable ? () => onChange(item) : null}
        >
          <span className="flex align-center">
            {renderItemIcon(item, itemIndex, isSelected)}
          </span>
          <h4 className="List-item-title ml1 text-wrap">{item.name}</h4>
        </a>
        {renderItemExtra(item, itemIndex, isSelected)}
        {showItemArrows && (
          <div className="List-item-arrow flex align-center px1">
            <Icon name="chevronright" size={8} />
          </div>
        )}
      </div>,
    );
  }

  return (
    <div
      style={style}
      className={cx("List-section", section.className, {
        "List-section--expanded": sectionIsExpanded(sectionIndex),
        "List-section--togglable": sectionIsTogglable(sectionIndex),
      })}
    >
      {content}
    </div>
  );
};
