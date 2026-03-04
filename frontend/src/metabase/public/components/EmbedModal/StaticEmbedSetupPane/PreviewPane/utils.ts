import { match } from "ts-pattern";

import type { PreviewBackgroundType } from "./PreviewPane";

export function getCheckerBoardDataUri(
  theme: Extract<
    PreviewBackgroundType,
    "checkerboard-light" | "checkerboard-dark"
  >,
) {
  const [color1, color2] = match(theme)
    .returnType<[string, string]>()
    // eslint-disable-next-line metabase/no-color-literals
    .with("checkerboard-light", () => ["#ededed", "#ffffff"])
    // eslint-disable-next-line metabase/no-color-literals
    .with("checkerboard-dark", () => ["#000000", "#323232"])
    .exhaustive();

  const svg = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<rect width="10" height="10" fill="${color1}" />
<rect x="10" width="10" height="10" fill="${color2}" />
<rect x="10" y="10" width="10" height="10" fill="${color1}" />
<rect y="10" width="10" height="10" fill="${color2}" />
</svg>`;

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
