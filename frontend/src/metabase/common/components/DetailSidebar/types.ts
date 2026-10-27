import type { ReactNode } from "react";

import type { StackProps } from "metabase/ui";

export type SidebarSectionProps = {
  title: string;
  titleAside?: ReactNode;
  children: ReactNode;
  /** space between the title and the content */
  gap?: StackProps["gap"];
};

export type DetailsRowProps = {
  label: ReactNode;
  value: ReactNode;
  bold?: boolean;
  spanLabel?: boolean;
};

export type SidebarNavDirection = "previous" | "next";

export type SidebarNavButtonProps = {
  direction: SidebarNavDirection;
  label: string;
  disabled: boolean;
  onClick: () => void;
};
