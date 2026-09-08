import type { CSSProperties } from "react";

import type { ColumnFormattingSetting } from "metabase-types/api";
import { Box } from "metabase/ui";

import { ColorRange } from "../ColorRange";

export const RuleBackground = ({
  rule,
  className,
  style,
}: {
  rule: ColumnFormattingSetting;
  className?: string;
  style: CSSProperties;
}) =>
  rule.type === "range" ? (
    <ColorRange colors={rule.colors} className={className} style={style} />
  ) : rule.type === "single" ? (
    // @ts-expect-error viz settings need to accept hex color values
    <Box className={className} style={style} bg={rule.color} />
  ) : null;
