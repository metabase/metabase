import type { ReactNode } from "react";

import type { IconName } from "metabase/ui";

export type Item = object | string;

export type Section<TItem extends Item = Item> = {
  key?: string;
  name?: ReactNode;
  type?:
    | "action"
    | "header"
    | "search"
    | "loading"
    | "no-results"
    | "item"
    | "back";
  icon?: IconName | null;
  loading?: boolean;
  className?: string;
  items?: TItem[];
  alwaysSortLast?: boolean;
};

export type Row<TItem extends Item, TSection extends Section<TItem>> = {
  section: TSection;
  sectionIndex: number;
  isLastSection: boolean;
} & (
  | {
      type: "action";
    }
  | {
      type: "header";
    }
  | {
      type: "search";
    }
  | {
      type: "loading";
    }
  | {
      type: "no-results";
    }
  | {
      type: "back";
    }
  | {
      type: "item";
      item: TItem;
      itemIndex: number;
      isLastItem: boolean;
    }
);

export type SearchProp<TItem extends Item> = TItem extends object
  ? keyof TItem
  : string;

export type SearchProps<TItem extends Item> =
  | Readonly<SearchProp<TItem>[]>
  | SearchProp<TItem>;
