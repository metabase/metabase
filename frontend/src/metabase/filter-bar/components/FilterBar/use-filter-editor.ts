import type { Editor } from "@tiptap/core";
import { useState } from "react";

import {
  type FilterEditorRequest,
  getPillRectAt,
  placePillAt,
} from "../../editor";
import { pillToken } from "../../model";
import type { FilterBarAdapter } from "../../types";

export const useFilterEditor = <F>(adapter: FilterBarAdapter<F>) => {
  const [request, setRequest] = useState<FilterEditorRequest<F> | null>(null);

  const close = (editor: Editor | null) => {
    setRequest(null);
    editor?.commands.focus();
  };

  const getRect = (editor: Editor | null) =>
    editor && request ? getPillRectAt(editor, request.pos) : null;

  const dismiss = (editor: Editor | null) => {
    if (request) {
      close(editor);
    }
  };

  const render = (editor: Editor | null) =>
    request &&
    adapter.stage(request.targetStage).renderFilterEditor?.({
      ...request,
      onChange: (filter) => {
        if (editor) {
          const { pos, targetStage } = request;
          const content = adapter.stage(targetStage).toPill(filter);
          placePillAt(editor, pos, pillToken(filter, content), targetStage);
        }
        close(editor);
      },
      onClose: () => close(editor),
    });

  return {
    open: setRequest,
    getRect,
    dismiss,
    render,
  };
};
