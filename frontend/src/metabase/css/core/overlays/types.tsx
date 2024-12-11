import { Dispatch, SetStateAction } from "react";

export type OverlaysDemoProps = {
  enableNesting: boolean;
  overlaysToOpen?: OverlayType[];
};

export enum OverlayType {
  "legacyModal",
  "mantineModal",
  "mantineModalWithTitleProp",
  "toast",
  "actionToast",
  "sidesheet",
  "entityPicker",
  "commandPalette",
  "undo",
  "mantinePopover",
  "mantineTooltip",
  "mantineMenu",
  "mantineSelect",
  "hoverCard",
  "legacySelect",
  "legacyTooltip",
  "legacyPopover",
}

export type Setter = Dispatch<SetStateAction<number>>;
