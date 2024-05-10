import type { EmbeddingTheme } from "embedding-sdk/types/theme/private";
import { alpha } from "metabase/lib/colors";

export function getTableCellTheme({
  theme,
  isIDColumn,
}: {
  theme: EmbeddingTheme;
  isIDColumn: boolean;
}) {
  const cellTheme = theme.other?.table?.cell;
  const idTheme = theme.other?.table?.idColumn;

  const color = cellTheme?.textColor || "text-brand";
  const background = cellTheme?.backgroundColor;

  if (isIDColumn) {
    return {
      color: idTheme?.textColor || "brand",
      background:
        idTheme?.backgroundColor || alpha(theme.fn?.themeColor("brand"), 0.08),
    };
  }

  return { color, background };
}
