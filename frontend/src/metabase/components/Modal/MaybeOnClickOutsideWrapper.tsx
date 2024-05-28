import type * as React from "react";

import OnClickOutsideWrapper from "metabase/components/OnClickOutsideWrapper";

export function MaybeOnClickOutsideWrapper({
  children,
  closeOnClickOutside = false,
  ...props
}: {
  children: React.ReactNode;
  closeOnClickOutside?: boolean;
} & React.ComponentProps<typeof OnClickOutsideWrapper>) {
  return closeOnClickOutside ? (
    <>{children}</>
  ) : (
    <OnClickOutsideWrapper {...props}>{children}</OnClickOutsideWrapper>
  );
}
