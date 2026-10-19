import type { ComponentType } from "react";

export type SideView = "dataReference" | "actionForm" | "actionSettings";

export interface ActionCreatorUIProps {
  canRename: boolean;
  canChangeFieldSettings: boolean;
}

// The data reference is query-editing UI from a module above this one,
// so the composing module supplies it through this slot.
export interface DataReferenceSlot {
  TriggerButton: ComponentType<{ onClick: () => void }>;
  Panel: ComponentType<{ onClose?: () => void; onBack?: () => void }>;
}
