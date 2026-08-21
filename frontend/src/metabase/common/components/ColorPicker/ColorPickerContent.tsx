import Color from "color";
import type { HTMLAttributes, Ref } from "react";
import { Suspense, forwardRef, lazy, useCallback, useMemo } from "react";
import type { ColorState } from "react-color";
import { useMount } from "react-use";
import { t } from "ttag";

import { ColorInput } from "metabase/common/components/ColorInput";
import { Group, NumberInput } from "metabase/ui";

import { ContentContainer, ControlsPlaceholder } from "./ColorPicker.styled";

/**
 * The saturation and hue controls carry `react-color`, which nothing else in the
 * app uses. They only render once a picker is open, so they load then.
 */
const loadColorPickerControls = () =>
  import(
    /* webpackChunkName: "color-picker-controls" */ "./ColorPickerControls"
  );

const ColorPickerControls = lazy(() =>
  loadColorPickerControls().then(({ ColorPickerControls }) => ({
    default: ColorPickerControls,
  })),
);

/**
 * Start the controls chunk while the picker is still closed.
 *
 * A picker lives in a popover, so its content mounts on the click that opens it,
 * which is too late to hide the load behind anything. Call this from whatever
 * renders the popover target, and the placeholder only shows on a slow
 * connection.
 */
export function usePrefetchColorPickerControls() {
  useMount(() => {
    loadColorPickerControls().catch(() => {
      // The picker loads the chunk again when it opens, and reports the failure there.
    });
  });
}

export type ColorPickerContentAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange"
>;

export interface ColorPickerContentProps extends ColorPickerContentAttributes {
  value?: string;
  showAlpha?: boolean;
  onChange?: (value?: string) => void;
}

export const ColorPickerContent = forwardRef(function ColorPickerContent(
  { value, showAlpha, onChange, ...props }: ColorPickerContentProps,
  ref: Ref<HTMLDivElement>,
) {
  const alpha = useMemo(() => getAlpha(value), [value]);

  const handlePickerChange = useCallback(
    (state: ColorState) => {
      const newAlpha = state.rgb.a ?? 1;
      onChange?.(buildHex(state.hex, showAlpha ? newAlpha : 1));
    },
    [onChange, showAlpha],
  );

  const handleHexChange = useCallback(
    (newHex?: string) => {
      if (!showAlpha || !newHex) {
        onChange?.(newHex);
        return;
      }
      onChange?.(buildHex(newHex, alpha));
    },
    [onChange, showAlpha, alpha],
  );

  const handleAlphaPercentChange = useCallback(
    (percent: string | number) => {
      const baseHex = getBaseHex(value);
      if (!baseHex) {
        return;
      }
      const parsed =
        typeof percent === "number" ? percent : parseFloat(percent);
      if (!Number.isFinite(parsed)) {
        return;
      }
      const clamped = Math.max(0, Math.min(100, parsed));
      onChange?.(buildHex(baseHex, clamped / 100));
    },
    [onChange, value],
  );

  return (
    <ContentContainer {...props} ref={ref}>
      <Suspense fallback={<ControlsPlaceholder />}>
        <ColorPickerControls color={value} onChange={handlePickerChange} />
      </Suspense>
      {showAlpha ? (
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <ColorInput value={value} fullWidth onChange={handleHexChange} />
          <NumberInput
            aria-label={t`Alpha percentage`}
            value={Math.round(alpha * 100)}
            onChange={handleAlphaPercentChange}
            min={0}
            max={100}
            w="6rem"
            rightSection="%"
            hideControls
          />
        </Group>
      ) : (
        <ColorInput value={value} fullWidth onChange={onChange} />
      )}
    </ContentContainer>
  );
});

const getAlpha = (value?: string): number => {
  try {
    return value ? Color(value).alpha() : 1;
  } catch {
    return 1;
  }
};

const getBaseHex = (value?: string): string | undefined => {
  try {
    return value ? Color(value).hex() : undefined;
  } catch {
    return undefined;
  }
};

const buildHex = (hex: string, alpha: number): string => {
  return Color(hex).alpha(alpha).hexa().toLowerCase();
};
