import { type ReactNode, forwardRef } from "react";
import { t } from "ttag";

import { Icon, UnstyledButton } from "metabase/ui";

import S from "./Token.module.css";

type TokenProps = {
  children: ReactNode;
  onClick: () => void;
  onRemove: () => void;
};

/** Figma "Filter token": a plain bordered pill, deliberately off the app's pill styling. */
export const Token = forwardRef<HTMLButtonElement, TokenProps>(function Token(
  { children, onClick, onRemove },
  ref,
) {
  return (
    <UnstyledButton ref={ref} className={S.token} onClick={onClick}>
      {children}
      <Icon
        name="close"
        size={12}
        role="button"
        aria-label={t`Remove`}
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
      />
    </UnstyledButton>
  );
});
