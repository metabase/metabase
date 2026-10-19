import type { ReactNode } from "react";

export type SidebarSectionProps = {
  title: string;
  titleAside?: ReactNode;
  children: ReactNode;
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

export type DetailSidebarHeaderProps<TId> = {
  prevId: TId | undefined;
  nextId: TId | undefined;
  previousLabel: string;
  nextLabel: string;
  /** The sidebar's own path, which the copy-link button copies. */
  detailPath: string;
  onNavigate: (id: TId) => void;
  onClose: () => void;
};

export type DetailSidebarTitleProps = {
  /** What kind of item the sidebar shows, above its name: "Session", "OAuth client". */
  typeLabel: string;
  title: string;
};
