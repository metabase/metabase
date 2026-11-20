import type { ReactNode } from "react";

import { Tooltip, UnstyledButton } from "metabase/ui";

import S from "./EditorD.module.css";

type InlineToolbarProps = {
  start?: ReactNode;
  end?: ReactNode;
};

/** Version D: no docs button; the docs open from the suggestions. */
export function InlineToolbar({ start, end }: InlineToolbarProps) {
  return (
    <div className={S.inlineToolbar}>
      {start}
      {end}
    </div>
  );
}

/** A small icon button at the end of the code row. */
export function CodeRowButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip label={label}>
      <UnstyledButton
        className={S.codeAction}
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
      >
        {icon}
      </UnstyledButton>
    </Tooltip>
  );
}
