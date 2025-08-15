import type { BubbleMenuViewProps } from "@tiptap/extension-bubble-menu";
import type { ComponentType } from "react";

declare module "@tiptap/react/menus" {
  export type BubbleMenu = ComponentType<BubbleMenuViewProps>;
}
