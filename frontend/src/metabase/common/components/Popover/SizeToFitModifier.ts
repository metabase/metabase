import * as popper from "@popperjs/core";

const PAGE_PADDING = 10;
const SIZE_TO_FIT_MIN_HEIGHT = 200;

export type SizeToFitOptions = {
  minHeight: number;
};

export function sizeToFitModifierFn({
  state,
  options,
}: popper.ModifierArguments<SizeToFitOptions>) {
  const {
    placement,
    rects: {
      popper: { height },
      reference: { height: targetHeight },
    },
  } = state;
  const { minHeight = SIZE_TO_FIT_MIN_HEIGHT } = options;

  const topPlacement = placement.startsWith("top");
  const bottomPlacement = placement.startsWith("bottom");

  if (topPlacement || bottomPlacement) {
    const overflow = popper.detectOverflow(state);
    const distanceFromEdge = placement.startsWith("top")
      ? overflow.top
      : overflow.bottom;

    const maxHeight = height - distanceFromEdge - PAGE_PADDING;
    const minnedMaxHeight = Math.max(maxHeight, minHeight);

    const oppositeSpace = window.innerHeight - targetHeight - maxHeight;

    if (
      maxHeight < minHeight &&
      oppositeSpace > minHeight &&
      !state.modifiersData.sizeToFit.flipped
    ) {
      state.placement = getAltPlacement(placement);
      state.modifiersData.sizeToFit.flipped = true;
      state.reset = true;
    } else {
      state.styles.popper.maxHeight = `${minnedMaxHeight}px`;
    }
  }
}

export function getAltPlacement(
  placementStr: popper.Placement,
): popper.Placement {
  const [targetPlacement, horizontalPlacement] = placementStr.split("-") as
    | [string]
    | [string, string];
  const newPlacement = [
    targetPlacement === "top" ? "bottom" : "top",
    horizontalPlacement,
  ]
    .filter((str): str is string => Boolean(str))
    .join("-");

  return newPlacement as popper.Placement;
}
