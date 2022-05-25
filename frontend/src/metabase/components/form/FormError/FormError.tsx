import React, { ReactNode, useEffect, useMemo, useRef } from "react";
import { getErrorMessageWithBoldFields } from "metabase/lib/form";
import { BaseFieldDefinition } from "metabase-types/forms";

import { ErrorCard, ScrollAnchor, WarningIcon } from "./FormError.styled";

interface FormErrorProps {
  error?: string;
  formFields?: BaseFieldDefinition[];
  anchorMarginTop?: number;
}

export default function FormError({
  error,
  formFields,
  anchorMarginTop,
}: FormErrorProps) {
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) {
      scrollAnchorRef.current?.scrollIntoView();
    }
  }, [error]);

  const renderedError = useMemo(
    () => getErrorMessageWithBoldFields(error, formFields),
    [error, formFields],
  );

  if (error) {
    return (
      <ErrorCard flat>
        <ScrollAnchor anchorMarginTop={anchorMarginTop} ref={scrollAnchorRef} />
        <WarningIcon name="warning" />
        <span>{renderedError}</span>
      </ErrorCard>
    );
  }

  return null;
}
