export type TabType = "past" | "current" | "next";

export interface Tab {
  type: TabType;
  label: string;
}
