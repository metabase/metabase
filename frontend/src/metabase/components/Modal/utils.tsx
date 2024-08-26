import * as React from "react";
import _ from "underscore";

import ModalContent from "metabase/components/ModalContent";

export const modalSizes = ["small", "medium", "wide", "tall", "fit"] as const;
export type ModalSize = typeof modalSizes[number];

export type BaseModalProps = {
  children?: React.ReactNode;
  className?: string;
  enableMouseEvents?: boolean;
  enableTransition?: boolean;
  closeOnClickOutside?: boolean;
  noBackdrop?: boolean;
  noCloseOnBackdrop?: boolean;
  form?: unknown;
  title?: string | JSX.Element;
  footer?: string;
};

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
