import type { ReactNode } from "react";

import type { IconName } from "metabase/ui";

export type Section<T extends Item = Item> = {
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
  items?: T[];
  active?: boolean;
  className?: string | null;
};

export type Item = object;

export type Row<T extends object> = {
  section: Section<T>;
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
      item: T;
      itemIndex: number;
      isLastItem: boolean;
    }
);
