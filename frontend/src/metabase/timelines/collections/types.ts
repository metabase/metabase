export interface MenuItem {
  title: string;
  link?: string;
  action?: () => void;
}

export interface ModalParams {
  slug: string;
  timelineId?: string;
  timelineEventId?: string;
}
