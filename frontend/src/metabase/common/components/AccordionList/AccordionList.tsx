import cx from "classnames";
import {
  type CSSProperties,
  Component,
  type KeyboardEvent,
  type RefObject,
  createRef,
} from "react";
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
};

export class AccordionList<
  TItem extends Item,
  TSection extends Section<TItem> = Section<TItem>,
> extends Component<Props<TItem, TSection>, State> {
  listRootRef: RefObject<HTMLDivElement>;

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
    };

    this.listRootRef = createRef();
  }

  componentDidMount() {
    setTimeout(() => {
      const container = this.listRootRef.current;
      const hasFocusedChildren = container?.contains(document.activeElement);
      // focus the container on opening, unless a child element is already focused
      if (!hasFocusedChildren && this.props.hasInitialFocus) {
        container?.focus();
      }

      // scroll to the selected row on opening
      container?.querySelector("[aria-selected=true]")?.scrollIntoView({
        block: "center",
      });
    }, 0);
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

      return this.setState({ cursor: prevCursor });
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      const nextCursor = getNextCursor(
        cursor ?? this.getInitialCursor(),
        this.getRows(),
        this.canSelectSection,
      );

      return this.setState({ cursor: nextCursor });
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
      searchable = (section: TSection) =>
        section?.items && section.items.length > 10,
      sections,
      searchProp,
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

  render() {
    const {
      id,
      style = {},
      width = 300,
      className,
      globalSearch = false,
      sections,
      "data-testid": testId,
      alwaysExpanded = false,
    } = this.props;

    const rows = this.getRows();
    const searchRowIndex = rows.findIndex((row) => row.type === "search");
    const hasSearch = searchRowIndex >= 0;

    return (
      <Box
        id={id}
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
          />
        ))}
      </Box>
    );
  }
}
