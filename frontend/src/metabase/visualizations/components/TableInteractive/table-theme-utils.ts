import type { EmbeddingTheme } from "embedding-sdk/types/theme/private";
import { alpha, lighten } from "metabase/lib/colors";

export function getCellDataTheme({
  theme,
  isIDColumn,
}: {
  theme: EmbeddingTheme;
  isIDColumn: boolean;
}) {
  const cellTheme = theme.other?.table?.cell;
  const idTheme = theme.other?.table?.idColumn;

  if (isIDColumn) {
    return {
      color: idTheme?.textColor || "brand",
      background:
        idTheme?.backgroundColor || alpha(theme.fn.themeColor("brand"), 0.08),
      border: `1px solid ${alpha(
        idTheme?.backgroundColor || theme.fn.themeColor("brand"),
        0.14,
      )}`,
    };
  }

  return { color: cellTheme?.textColor || "text-brand" };
}

export const getCellHoverBackground = ({
  theme,
}: {
  theme: EmbeddingTheme;
}): string => {
  const background = theme.other?.table?.cell?.backgroundColor;
  if (background) {
    return lighten(background, 0.1);
  }

  return alpha(theme.fn.themeColor("brand"), 0.1);
};
