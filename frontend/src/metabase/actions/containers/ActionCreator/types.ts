export type SideView = "dataReference" | "actionForm" | "actionSettings";

export interface ActionCreatorUIProps {
  canRename: boolean;
  canChangeFormSettings: boolean;
  hasSaveButton: boolean;
}
