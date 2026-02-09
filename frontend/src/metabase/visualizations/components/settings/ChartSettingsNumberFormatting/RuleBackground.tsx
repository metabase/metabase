import type { CSSProperties } from "react";

import { ColorRange } from "metabase/common/components/ColorRange";
import { Box } from "metabase/ui";

import type { NumberFormattingSetting } from "./types";

export const RuleBackground = ({
  rule,
  className,
  style,
}: {
  rule: NumberFormattingSetting;
  className?: string;
  style: CSSProperties;
}) =>
  rule.type === "range" ? (
    <ColorRange colors={rule.colors} className={className} style={style} />
  ) : rule.type === "single" ? (
    // @ts-expect-error viz settings need to accept hex color values
    <Box className={className} style={style} bg={rule.color} />
  ) : null;
