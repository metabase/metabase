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
  detailPath: string;
  onNavigate: (id: TId) => void;
  onClose: () => void;
};

export type DetailSidebarTitleProps = {
  typeLabel: string;
  title: string;
};
