import type { HTMLAttributes, ReactNode } from "react";
import { Children } from "react";

import {
  ButtonBarCenter,
  ButtonBarLeft,
  ButtonBarRight,
  ButtonBarRoot,
} from "./ButtonBar.styled";

function normalizeArray(array?: ReactNode) {
  if (Array.isArray(array)) {
    array = array.filter(a => a);
    if (Array.isArray(array) && array.length === 0) {
      array = null;
    } else {
      array = Children.toArray(array);
    }
  }
  return array;
}

interface ButtonBarProps extends HTMLAttributes<HTMLDivElement> {
  left?: ReactNode;
  right?: ReactNode;
  center?: ReactNode;
  children?: ReactNode;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function ButtonBar({
  children,
  left = children,
  center,
  right,
  ...props
}: ButtonBarProps) {
  left = normalizeArray(left);
  center = normalizeArray(center);
  right = normalizeArray(right);

  return (
    <ButtonBarRoot {...props}>
      <ButtonBarLeft center={center}>{left}</ButtonBarLeft>
      {center && <ButtonBarCenter>{center}</ButtonBarCenter>}
      <ButtonBarRight center={center}>{right}</ButtonBarRight>
    </ButtonBarRoot>
  );
}
