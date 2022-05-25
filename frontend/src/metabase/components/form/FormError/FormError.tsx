import React, { ReactNode, useEffect, useRef } from "react";
import cx from "classnames";

import { ErrorCard, ScrollAnchor, WarningIcon } from "./FormError.styled";

interface FormErrorProps {
  error?: ReactNode;
  anchorMarginTop?: number;
}

export default function FormError({ error, anchorMarginTop }: FormErrorProps) {
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) {
      scrollAnchorRef.current?.scrollIntoView();
    }
  }, [error]);

  if (error) {
    return (
      <ErrorCard flat>
        <ScrollAnchor anchorMarginTop={anchorMarginTop} ref={scrollAnchorRef} />
        <WarningIcon name="warning" />
        <span>{error}</span>
      </ErrorCard>
    );
  }

  return null;
}
