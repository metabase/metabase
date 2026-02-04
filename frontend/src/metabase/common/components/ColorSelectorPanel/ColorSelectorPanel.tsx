import { hexToHsva, hsvaToHex } from "@uiw/color-convert";
import Chrome, { ChromeInputType } from "@uiw/react-color-chrome";
import type { HTMLAttributes } from "react";
import { useCallback, useState } from "react";

import { colors } from "metabase/lib/colors/palette";
import { Box, Button } from "metabase/ui";

import S from "./ColorSelectorPanel.module.css";
export interface ColorSelectorPopoverInnerProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  initalColor?: string;
  onChange?: (newValue: string) => void;
  onClose?: () => void;
  saveColorLabel?: string;
  style?: React.CSSProperties;
}

export const ColorSelectorPanel = ({
  initalColor,
  onChange,
  onClose,
  saveColorLabel,
  style,
}: ColorSelectorPopoverInnerProps) => {
  const [hsva, setHsva] = useState(
    hexToHsva(initalColor ?? colors["bg-black"]),
  );
  const handleSelect = useCallback(() => {
    onChange?.(hsvaToHex(hsva));
    onClose?.();
  }, [onChange, onClose, hsva]);

  return (
    <Box className={S.ChromeColorPicker} style={style}>
      <Chrome
        inputType={ChromeInputType.HEXA}
        color={hsva}
        showColorPreview={false}
        style={{ border: "none", boxShadow: "none" }}
        showTriangle={false}
        onChange={(clr) => {
          setHsva(clr.hsva);
        }}
      />
      <Button variant="filled" size="sm" onClick={handleSelect}>
        {saveColorLabel ?? `Save`}
      </Button>
    </Box>
  );
};
