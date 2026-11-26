import { type Ref, useImperativeHandle, useState } from "react";
import { match } from "ts-pattern";

import type { BareSuggestionRendererRef } from "metabase/rich_text_editing/tiptap/extensions/suggestionRenderer";

type SuggestionKeysOptions = {
  handle: Ref<BareSuggestionRendererRef>;
  query: string;
  isEmpty: boolean;
  firstIndex: number;
  getNextIndex: (index: number, step: 1 | -1) => number;
  pickActive: (index: number) => boolean;
  pickExact: () => boolean;
};

export const useSuggestionKeys = ({
  handle,
  query,
  isEmpty,
  firstIndex,
  getNextIndex,
  pickActive,
  pickExact,
}: SuggestionKeysOptions) => {
  const [active, setActive] = useState<{ query: string | null; index: number }>(
    { query: null, index: firstIndex },
  );
  const activeIndex = active.query === query ? active.index : firstIndex;
  const setActiveIndex = (index: number) => setActive({ query, index });

  const move = (step: 1 | -1) => {
    setActiveIndex(getNextIndex(activeIndex, step));
    return true;
  };

  useImperativeHandle(handle, () => ({
    onKeyDown: ({ event }) =>
      !isEmpty &&
      match(event.key)
        .with("ArrowDown", () => move(1))
        .with("ArrowUp", () => move(-1))
        .with("Enter", () => pickActive(activeIndex))
        .with("Tab", () => !event.shiftKey && pickActive(activeIndex))
        .with(" ", pickExact)
        .otherwise(() => false),
  }));

  return { activeIndex, setActiveIndex };
};
