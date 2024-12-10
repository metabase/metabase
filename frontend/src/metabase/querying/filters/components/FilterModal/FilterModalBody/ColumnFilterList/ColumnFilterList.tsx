import { Fragment, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import type { ColumnItem } from "metabase/querying/filters/types";
import type * as Lib from "metabase-lib";

import { ColumnFilterGroup } from "../ColumnFilterGroup";
import { SectionItems, SectionTitle } from "../poc.styled";

import { getSectionId, sortColumns } from "./utils";

export interface ColumnFilterListProps {
  query: Lib.Query;
  columnItems: ColumnItem[];
  isSearching: boolean;
  onChange: (newQuery: Lib.Query) => void;
  onInput: () => void;
}

export const ColumnFilterList = ({
  query,
  columnItems,
  isSearching,
  onChange,
  onInput,
}: ColumnFilterListProps) => {
  const sortedItems = useMemo(() => sortColumns(columnItems), [columnItems]);
  const sectionsItems = useMemo(() => {
    return _.groupBy(sortedItems, item => getSectionId(item.column));
  }, [sortedItems]);
  const sections = useMemo(() => {
    return [
      {
        title: t`Date`,
        items: sectionsItems.datetime,
      },
      {
        title: t`True/False`,
        items: sectionsItems.boolean,
      },
      {
        title: t`Text`,
        items: sectionsItems.text,
      },
      {
        title: t`Location`,
        items: sectionsItems.location,
      },
      {
        title: t`Number`,
        items: sectionsItems.number,
      },
      {
        title: t`ID`,
        items: sectionsItems.id,
      },
      {
        title: t`Other`,
        items: sectionsItems.unknown,
      },
    ].filter(({ items }) => items?.length > 0);
  }, [sectionsItems]);

  return (
    <>
      {sections.map((section, sectionIndex) => (
        <Fragment key={sectionIndex}>
          <SectionTitle>{section.title}</SectionTitle>

          <SectionItems>
            {section.items.map((columnItem, columnIndex) => (
              <ColumnFilterGroup
                key={columnIndex}
                query={query}
                columnItem={columnItem}
                isSearching={isSearching}
                onChange={onChange}
                onInput={onInput}
              />
            ))}
          </SectionItems>
        </Fragment>
      ))}
    </>
  );
};
