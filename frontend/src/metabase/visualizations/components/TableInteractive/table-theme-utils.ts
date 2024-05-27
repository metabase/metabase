import type { EmbeddingTheme } from "embedding-sdk/types/theme/private";
import { alpha, isDark, lighten } from "metabase/lib/colors";

/**
 * Cell data is the inner container within a table cell.
 * It is primarily used to display the ID column.
 * The styling here does not apply to the outer cell container.
 */
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
      color: idTheme?.textColor,
      background:
        idTheme?.backgroundColor || alpha(theme.fn.themeColor("brand"), 0.08),
      border: `1px solid ${alpha(
        idTheme?.backgroundColor || theme.fn.themeColor("brand"),
        0.14,
      )}`,
    };
  }

  return { color: cellTheme?.textColor };
}

export const getCellHoverBackground = ({
  theme,
}: {
  theme: EmbeddingTheme;
}): string => {
  const brand = theme.fn.themeColor("brand");
  const background = theme.other?.table?.cell?.backgroundColor;

  if (background && isDark(background)) {
    return lighten(background, 0.1);
  }

  return alpha(brand, 0.1);
};
