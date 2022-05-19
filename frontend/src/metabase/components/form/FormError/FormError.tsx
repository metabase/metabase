import React, { useEffect, useRef } from "react";
import cx from "classnames";

import Markdown from "metabase/core/components/Markdown";
import { ErrorCard, ScrollAnchor, WarningIcon } from "./FormError.styled";

interface FormErrorProps {
  error: string;
  className?: string;
  anchorMarginTop?: number;
}

export default function FormError({
  error,
  className,
  anchorMarginTop,
}: FormErrorProps) {
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) {
      scrollAnchorRef.current?.scrollIntoView();
    }
  }, [error]);

  if (error) {
    return (
      <ErrorCard flat className={cx("bg-error", className)}>
        <ScrollAnchor anchorMarginTop={anchorMarginTop} ref={scrollAnchorRef} />
        <WarningIcon name="warning" />
        <Markdown>{error}</Markdown>
      </ErrorCard>
    );
  }

  return null;
}
