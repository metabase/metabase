import React from "react";
import OnClickOutsideWrapper from "metabase/components/OnClickOutsideWrapper";

export function MaybeOnClickOutsideWrapper({
  children,
  noOnClickOutsideWrapper = false,
  ...props
}: {
  children: React.ReactNode;
  noOnClickOutsideWrapper?: boolean;
} & React.ComponentProps<typeof OnClickOutsideWrapper>) {
  return noOnClickOutsideWrapper ? (
    <div>{children}</div>
  ) : (
    <OnClickOutsideWrapper {...props}>{children}</OnClickOutsideWrapper>
  );
}
