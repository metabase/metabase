import type { ReactNode } from "react";

import S from "./EditorF.module.css";

type InlineToolbarProps = {
  start?: ReactNode;
  end?: ReactNode;
};

/** Version F: no docs button; the docs open from the suggestions. */
export function InlineToolbar({ start, end }: InlineToolbarProps) {
  return (
    <div className={S.inlineToolbar}>
      {start}
      {end}
    </div>
  );
}
