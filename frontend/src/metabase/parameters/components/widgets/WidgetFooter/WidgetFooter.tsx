import React from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";

import { WidgetFooterRoot } from "./WidgetFooter.styled";

type WidgetFooterProps = {
  className?: string;
  savedValue: any[];
  unsavedValue: any[];
  commitUnsavedValue: (value: any[] | null) => void;
};

function WidgetFooter({
  className,
  savedValue,
  unsavedValue,
  commitUnsavedValue,
}: WidgetFooterProps) {
  const isMissingValue = savedValue.length === 0 && unsavedValue.length === 0;
  return (
    <WidgetFooterRoot className={className}>
      <Button
        primary
        className="ml-auto"
        disabled={isMissingValue}
        onClick={() => {
          commitUnsavedValue(unsavedValue.length > 0 ? unsavedValue : null);
        }}
      >
        {savedValue.length > 0 ? t`Update filter` : t`Add filter`}
      </Button>
    </WidgetFooterRoot>
  );
}

export default WidgetFooter;
