import type { ReactNode } from "react";

import type { IconName } from "metabase/ui";

export type Item = object;

export type Section<TItem extends Item = Item> = {
  key?: string;
  name?: ReactNode;
  displayName?: ReactNode;
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
  items?: TItem[];
  active?: boolean;
  className?: string | null;
};

export type Row<TItem extends Item> = {
  section: Section<TItem>;
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
