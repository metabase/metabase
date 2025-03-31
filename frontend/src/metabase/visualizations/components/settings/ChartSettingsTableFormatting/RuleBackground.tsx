import type { CSSProperties } from "react";

import { ColorRange } from "metabase/core/components/ColorRange";
import { Box } from "metabase/ui";
import type { ColumnFormattingSetting } from "metabase-types/api";

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
    <Box className={className} style={style} bg={rule.color} />
  ) : null;
