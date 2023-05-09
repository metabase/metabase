import React from "react";
import _ from "underscore";
import OnClickOutsideWrapper from "metabase/components/OnClickOutsideWrapper";
import ModalContent from "metabase/components/ModalContent";

export function getModalContent(props: any) {
  if (
    React.Children.count(props.children) > 1 ||
    props.title != null ||
    props.footer != null
  ) {
    return <ModalContent {..._.omit(props, "className", "style")} />;
  } else {
    return React.Children.only(props.children);
  }
}

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

export const modalSizes = ["small", "medium", "wide", "tall", "fit"] as const;
export type ModalSize = typeof modalSizes[number];
