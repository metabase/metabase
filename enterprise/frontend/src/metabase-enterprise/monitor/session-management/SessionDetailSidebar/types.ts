import type { ReactNode } from "react";

import type { AdminSession, AdminSessionId } from "metabase-types/api";

export type SessionDetailSidebarProps = {
  sessionId: AdminSessionId;
  sessionFromPage: AdminSession | undefined;
  prevSessionId: AdminSessionId | undefined;
  nextSessionId: AdminSessionId | undefined;
  onNavigate: (sessionId: AdminSessionId) => void;
  onClose: () => void;
};

export type SidebarHeaderProps = {
  sessionId: AdminSessionId;
  session: AdminSession | undefined;
  prevSessionId: AdminSessionId | undefined;
  nextSessionId: AdminSessionId | undefined;
  onNavigate: (sessionId: AdminSessionId) => void;
  onClose: () => void;
};

export type SessionDetailsProps = {
  session: AdminSession;
};

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
