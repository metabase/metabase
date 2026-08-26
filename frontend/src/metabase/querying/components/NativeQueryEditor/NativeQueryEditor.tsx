import { type ReactNode, forwardRef } from "react";

import {
  type NativeQueryEditorCoreProps,
  NativeQueryEditorRoot,
} from "./NativeQueryEditorRoot";
import { ParametersList } from "./slots/ParametersList";
import { RunButton } from "./slots/RunButton";
import { Sidebar } from "./slots/Sidebar";
import { TopBar } from "./slots/TopBar";
import { VisibilityToggler } from "./slots/VisibilityToggler";

type NativeQueryEditorProps = NativeQueryEditorCoreProps & {
  children?: ReactNode;
};

/**
 * Native (SQL) query editor.
 *
 * Assemble only the parts you need via the composition API:
 *
 *     <NativeQueryEditor question={question} query={query} setDatasetQuery={...}>
 *       <NativeQueryEditor.TopBar>
 *         <NativeQueryEditor.ParametersList />
 *         <NativeQueryEditor.Sidebar features={...} />
 *         <NativeQueryEditor.VisibilityToggler />
 *       </NativeQueryEditor.TopBar>
 *       <NativeQueryEditor.RunButton />
 *     </NativeQueryEditor>
 */
const NativeQueryEditorBase = forwardRef<
  HTMLDivElement,
  NativeQueryEditorProps
>(function NativeQueryEditor({ children, ...coreProps }, ref) {
  return (
    <NativeQueryEditorRoot {...coreProps} ref={ref}>
      {children}
    </NativeQueryEditorRoot>
  );
});

export const NativeQueryEditor = Object.assign(NativeQueryEditorBase, {
  TopBar,
  Sidebar,
  ParametersList,
  VisibilityToggler,
  RunButton,
});
