import Markdown from "metabase/core/components/Markdown";
import React from "react";

import { ErrorCard, WarningIcon } from "./FormError.styled";

interface FormErrorProps {
  error: string;
}

export default function FormError({ error }: FormErrorProps) {
  if (error) {
    return (
      <ErrorCard flat className="bg-error">
        <WarningIcon name="warning" />
        <Markdown>{error}</Markdown>
      </ErrorCard>
    );
  }

  return null;
}
