import type { ReactNode } from "react";

import S from "./EditorC.module.css";

type InlineToolbarProps = {
  start?: ReactNode;
  end?: ReactNode;
};

/** Version B: no docs button; the docs open from the suggestions. */
export function InlineToolbar({ start, end }: InlineToolbarProps) {
  return (
    <div className={S.inlineToolbar}>
      {start}
      {end}
    </div>
  );
}
