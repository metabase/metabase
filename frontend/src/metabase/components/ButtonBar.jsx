/* eslint-disable react/prop-types */
import React, { Children } from "react";
import {
  ButtonBarCenter,
  ButtonBarLeft,
  ButtonBarRight,
  ButtonBarRoot,
} from "./ButtonBar.styled";

function normalizeArray(array) {
  if (Array.isArray(array)) {
    array = array.filter(a => a);
    if (array.length === 0) {
      array = null;
    } else {
      array = Children.toArray(array);
    }
  }
  return array;
}

export default function ButtonBar({
  children,
  left = children,
  center,
  right,
  ...props
}) {
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
