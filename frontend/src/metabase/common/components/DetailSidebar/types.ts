import type { ReactNode } from "react";

import type { StackProps } from "metabase/ui";

export type SidebarSectionProps = {
  title: string;
  titleAside?: ReactNode;
  /** Small supporting text, set closer to the title than the content is */
  description?: ReactNode;
  children: ReactNode;
  gap?: StackProps["gap"];
};

export type DetailsRowProps =
  | {
      label: ReactNode;
      value: ReactNode;
      bold?: boolean;
      spanLabel?: false;
      /** Drop the value cell's padding so an input inside can fill the whole cell */
      fillValue?: boolean;
      /** Hints, badges, or actions about the value, under the label */
      labelNote?: ReactNode;
      /** A small indicator at the far right of the label, like an icon */
      labelAside?: ReactNode;
    }
  | {
      /** A full-width note row, such as an empty state */
      label: ReactNode;
      value?: never;
      bold?: never;
      spanLabel: true;
      fillValue?: never;
      labelNote?: never;
      labelAside?: never;
    };

export type SidebarNavDirection = "previous" | "next";

export type SidebarNavButtonProps = {
  direction: SidebarNavDirection;
  label: string;
  disabled: boolean;
  onClick: () => void;
};
