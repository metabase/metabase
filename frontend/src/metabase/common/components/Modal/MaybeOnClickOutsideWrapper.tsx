import type * as React from "react";

import { OnClickOutsideWrapper } from "metabase/common/components/OnClickOutsideWrapper";

export function MaybeOnClickOutsideWrapper({
  children,
  closeOnClickOutside = false,
  ...props
}: {
  children: React.ReactNode;
  closeOnClickOutside?: boolean;
} & React.ComponentProps<typeof OnClickOutsideWrapper>) {
  // TODO: should be !closeOnClickOutside, however it breaks modal states in some places
  // (e.g. ESC button closes 2 stacked modals instead of just the top one)
  return closeOnClickOutside ? (
    <>{children}</>
  ) : (
    <OnClickOutsideWrapper {...props}>{children}</OnClickOutsideWrapper>
  );
}
