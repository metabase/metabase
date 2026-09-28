import type { Session, SessionId } from "metabase-types/api";

export type SessionDetailSidebarProps = {
  sessionId: SessionId;
  sessionFromPage: Session | undefined;
  prevSessionId: SessionId | undefined;
  nextSessionId: SessionId | undefined;
  isRevoking: boolean;
  onNavigate: (sessionId: SessionId) => void;
  onRevokeSession: (session: Session) => void;
  onRevokeUserSessions: (session: Session) => void;
  onClose: () => void;
};

export type SidebarHeaderProps = {
  sessionId: SessionId;
  session: Session | undefined;
  prevSessionId: SessionId | undefined;
  nextSessionId: SessionId | undefined;
  onNavigate: (sessionId: SessionId) => void;
  onClose: () => void;
};

export type SidebarFooterProps = {
  session: Session;
  isRevoking: boolean;
  canRevokeSession: boolean;
  canRevokeUserSessions: boolean;
  onRevokeSession: (session: Session) => void;
  onRevokeUserSessions: (session: Session) => void;
};

export type SessionDetailsProps = {
  session: Session;
};
