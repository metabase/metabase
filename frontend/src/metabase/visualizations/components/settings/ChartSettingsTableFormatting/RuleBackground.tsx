import { ColorRange } from "metabase/common/components/ColorRange";
import { Box } from "metabase/ui";
import type { ColumnFormattingSetting } from "metabase-types/api";

export const RuleBackground = ({
  rule,
  className,
  style,
}: {
  rule: ColumnFormattingSetting;
  className?: string;
  style: React.CSSProperties;
}) =>
  rule.type === "range" ? (
    <ColorRange colors={rule.colors} className={className} style={style} />
  ) : rule.type === "single" ? (
    <Box className={className} style={style} bg={rule.color} />
  ) : null;
