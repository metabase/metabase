import { useDebouncedCallback } from "@mantine/hooks";
import { useState } from "react";

import { ColorPillPicker } from "metabase/common/components/ColorPicker";

export const DebouncedColorPillPicker = ({
  initialValue,
  onChange,
  debounceMs,
}: {
  initialValue: string;
  onChange: (value: string) => void;
  debounceMs: number;
}) => {
  const [previewValue, setPreviewValue] = useState<string>(initialValue);

  const debouncedUpdate = useDebouncedCallback(onChange, debounceMs);

  return (
    <ColorPillPicker
      value={previewValue}
      onChange={(value) => {
        if (!value) {
          return;
        }

        setPreviewValue(value);
        debouncedUpdate(value);
      }}
    />
  );
};
