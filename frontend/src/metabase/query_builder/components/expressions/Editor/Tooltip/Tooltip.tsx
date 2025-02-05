import { currentCompletions } from "@codemirror/autocomplete";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import { Popover } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import { HelpText } from "../HelpText";
import { Listbox } from "../Listbox";
import { enclosingFunction } from "../util";

import S from "./Tooltip.module.css";

export function Tooltip({
  query,
  stageIndex,
  metadata,
  reportTimezone,
  tooltipRef,

  state,
  view,
}: {
  query: Lib.Query;
  stageIndex: number;
  metadata: Metadata;
  reportTimezone?: string;

  // from tooltip extension
  tooltipRef: React.RefObject<HTMLDivElement>;
  state: EditorState;
  view: EditorView;
}) {
  const doc = state.doc.toString();
  const enclosingFn = enclosingFunction(doc, state.selection.main.head);
  const completions = currentCompletions(state);

  return (
    <Popover
      opened
      position="bottom-start"
      returnFocus
      closeOnEscape
      middlewares={{ shift: false, flip: false }}
      positionDependencies={[
        doc,
        state.selection.main.head,
        completions.length,
      ]}
    >
      <Popover.Target>
        <div />
      </Popover.Target>
      <Popover.Dropdown
        data-testid="custom-expression-editor-suggestions"
        className={S.dropdown}
        mah={350}
      >
        <div className={S.tooltip} ref={tooltipRef}>
          <HelpText
            enclosingFunction={enclosingFn}
            query={query}
            metadata={metadata}
            reportTimezone={reportTimezone}
          />
          <Listbox
            state={state}
            view={view}
            query={query}
            stageIndex={stageIndex}
          />
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
