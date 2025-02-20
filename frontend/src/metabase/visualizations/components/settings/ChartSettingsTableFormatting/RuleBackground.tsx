import type { CSSProperties } from "react";

import ColorRange from "metabase/core/components/ColorRange";
import type { ColumnFormattingSetting } from "metabase-types/api";

import { SinglePreview } from "./ChartSettingsTableFormatting";

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
    <SinglePreview color={rule.color} className={className} style={style} />
  ) : null;
