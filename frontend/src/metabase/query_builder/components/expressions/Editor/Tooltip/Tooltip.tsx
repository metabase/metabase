import type { Completion } from "@codemirror/autocomplete";
import { forwardRef, useCallback, useEffect, useRef } from "react";

import { Box, Icon } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import { HelpText } from "../HelpText";

import S from "./Tooltip.module.css";

type TooltipProps = {
  completions: readonly Completion[];
  enclosingFunction: {
    name: string;
    from: number;
    to: number;
  } | null;
  hasFocus?: boolean;
  metadata: Metadata;
  onBlur: () => void;
  onCompletionClick: (index: number) => void;
  query: Lib.Query;
  reportTimezone?: string;
  selectedCompletion: number | null;
};

export const Tooltip = forwardRef<HTMLDivElement, TooltipProps>(
  function TooltipInner(props, ref) {
    const {
      completions,
      enclosingFunction,
      hasFocus,
      metadata,
      onBlur,
      onCompletionClick,
      query,
      reportTimezone,
      selectedCompletion,
    } = props;

    if (!hasFocus) {
      return null;
    }

    return (
      <Box className={S.tooltip} ref={ref} onBlur={onBlur} tabIndex={0}>
        <HelpText
          enclosingFunction={enclosingFunction?.name}
          query={query}
          metadata={metadata}
          reportTimezone={reportTimezone}
        />
        <Completions
          completions={completions}
          selectedCompletion={selectedCompletion}
          onCompletionClick={onCompletionClick}
        />
      </Box>
    );
  },
);

function Completions({
  completions,
  selectedCompletion,
  onCompletionClick,
}: {
  completions: readonly Completion[];
  selectedCompletion: number | null;
  onCompletionClick: (index: number) => void;
}) {
  if (completions.length <= 0) {
    return null;
  }

  return (
    <>
      <ul role="listbox" className={S.listbox}>
        {completions.map((completion, index) => (
          <CompletionItem
            key={index}
            completion={completion}
            index={index}
            selected={selectedCompletion === index}
            onCompletionClick={onCompletionClick}
          />
        ))}
      </ul>
      <Footer />
    </>
  );
}

function CompletionItem({
  completion,
  selected,
  onCompletionClick,
  index,
}: {
  completion: Completion;
  index: number;
  onCompletionClick: (index: number) => void;
  selected: boolean;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const handleMouseDown = useCallback(
    (evt: React.MouseEvent<HTMLLIElement>) => {
      evt.preventDefault();
      onCompletionClick(index);
    },
    [index, onCompletionClick],
  );

  useEffect(() => {
    if (!selected || !ref.current) {
      return;
    }

    ref.current.scrollIntoView({
      block: "nearest",
    });
  }, [selected]);

  return (
    <li
      ref={ref}
      role="option"
      aria-selected={selected}
      onMouseDown={handleMouseDown}
      className={S.item}
    >
      <Icon name={completion.icon} className={S.icon} />

      {completion.displayLabel ?? completion.label}
    </li>
  );
}

function Footer() {
  return (
    <Box className={S.footer}>
      <Icon name="arrow_up" className={S.key} />
      <Icon name="arrow_down" className={S.key} />
      to navigate.
      <span />
      <Icon name="enter_or_return" className={S.key} /> to select.
    </Box>
  );
}
