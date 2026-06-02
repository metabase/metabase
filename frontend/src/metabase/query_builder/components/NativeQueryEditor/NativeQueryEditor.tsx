import { Fragment, type ReactNode, forwardRef } from "react";

import type { SidebarFeatures } from "metabase/querying/editor/types";

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
  extraButton?: ReactNode;
  hasEditingSidebar?: boolean;
  hasParametersList?: boolean;
  hasRunButton?: boolean;
  hasTopBar?: boolean;
  sidebarFeatures?: SidebarFeatures;
  topBarInnerContent?: ReactNode;
};

/**
 * Native (SQL) query editor.
 *
 * Prefer the composition API, assembling only the parts you need:
 *
 *     <NativeQueryEditor question={question} query={query} setDatasetQuery={...}>
 *       <NativeQueryEditor.TopBar>
 *         <NativeQueryEditor.ParametersList />
 *         <NativeQueryEditor.Sidebar features={...} />
 *         <NativeQueryEditor.VisibilityToggler />
 *       </NativeQueryEditor.TopBar>
 *       <NativeQueryEditor.RunButton />
 *     </NativeQueryEditor>
 *
 * The legacy boolean-flag API (`hasTopBar`, `hasEditingSidebar`,
 * `hasParametersList`, `hasRunButton`, `sidebarFeatures`, `extraButton`,
 * `topBarInnerContent`) is still supported as a thin shim over the composition
 * internals and will be removed once all consumers have migrated. When
 * `children` are provided they take precedence and the legacy flags are ignored.
 */
const NativeQueryEditorBase = forwardRef<
  HTMLDivElement,
  NativeQueryEditorProps
>(function NativeQueryEditor(props, ref) {
  const {
    children,
    extraButton,
    hasEditingSidebar = true,
    hasParametersList,
    hasRunButton = hasEditingSidebar,
    hasTopBar = true,
    sidebarFeatures,
    topBarInnerContent,
    ...coreProps
  } = props;

  if (children != null) {
    return (
      <NativeQueryEditorRoot {...coreProps} ref={ref}>
        {children}
      </NativeQueryEditorRoot>
    );
  }

  const legacyChildren: ReactNode[] = [];
  if (hasTopBar) {
    legacyChildren.push(
      <TopBar key="top-bar">
        {hasParametersList !== false && <ParametersList />}
        {topBarInnerContent}
        {hasEditingSidebar && <Sidebar features={sidebarFeatures} />}
        <VisibilityToggler />
      </TopBar>,
    );
  }
  if (extraButton != null) {
    legacyChildren.push(<Fragment key="extra-button">{extraButton}</Fragment>);
  }
  if (hasRunButton) {
    legacyChildren.push(<RunButton key="run-button" />);
  }

  return (
    <NativeQueryEditorRoot {...coreProps} ref={ref}>
      {legacyChildren}
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
