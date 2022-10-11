import React, { useCallback, useState } from "react";

import EditableText, {
  EditableTextProps,
} from "metabase/core/components/EditableText";

export interface DataAppPageTitleProps
  extends Omit<EditableTextProps, "initialValue"> {
  titleTemplate: string;
  compiledTitle?: string;
}

function DataAppPageTitle({
  titleTemplate,
  compiledTitle,
  onFocus,
  onBlur,
  ...props
}: DataAppPageTitleProps) {
  const [isEditing, setEditing] = useState(false);

  const handleFocus = useCallback(() => {
    setEditing(true);
    onFocus?.();
  }, [onFocus]);

  const handleBlur = useCallback(() => {
    setEditing(false);
    onBlur?.();
  }, [onBlur]);

  return (
    <EditableText
      {...props}
      initialValue={isEditing ? titleTemplate : compiledTitle}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
}

export default DataAppPageTitle;
