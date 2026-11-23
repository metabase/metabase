import type { CSSProperties } from "react";

type PillShades = {
  /** The pill. */
  base: string;
  /** Lighter, on hover and while renaming. */
  hover: string;
  /** Darker, while selected, and the "+" on hover. */
  selected: string;
};

/**
 * The pill colors of the custom expression design (Figma: Custom expressions
 * file, frame 373:19836), for the steps that have them. The custom column
 * design uses the brand tokens; summaries and filters get the same steps from
 * their own colors.
 */
const PILL_SHADES: Partial<Record<string, PillShades>> = {
  "core-brand": {
    base: "var(--mb-color-background_surface-brand-strong)",
    // Figma has no token for this color.
    // eslint-disable-next-line metabase/no-color-literals
    hover: "#4181c4",
    selected: "var(--mb-color-background_surface-brand-strong-hover)",
  },
  // The summarize color is already as dark as the brand's strong shade.
  "core-summarize": {
    base: "var(--mb-color-core-summarize)",
    hover: "color-mix(in srgb, var(--mb-color-core-summarize), white 18%)",
    selected: "color-mix(in srgb, var(--mb-color-core-summarize), black 26%)",
  },
  // The filter color stays as light as today; only the selected pill is darker.
  "core-filter": {
    base: "var(--mb-color-core-filter)",
    hover: "color-mix(in srgb, var(--mb-color-core-filter), white 18%)",
    selected: "var(--mb-color-button-filled-filter-default)",
  },
};

/** The CSS variables of the pill colors of a step, or none when it has none. */
export function getPillShadeVars(color: string): CSSProperties | undefined {
  const shades = PILL_SHADES[color];
  return shades
    ? // CSSProperties has no type for custom properties.
      ({
        "--pill-base": shades.base,
        "--pill-hover": shades.hover,
        "--pill-selected": shades.selected,
      } as CSSProperties)
    : undefined;
}

/** The steps whose chips take the shades: summaries and filters. */
export const hasPillShades = (color: string) =>
  color === "core-summarize" || color === "core-filter";
