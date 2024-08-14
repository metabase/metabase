import { alpha, isDark, lighten } from "metabase/lib/colors";
import type { MantineTheme } from "metabase/ui";

/**
 * Cell data is the inner container within a table cell.
 * It is primarily used to display the ID column.
 * The styling here does not apply to the outer cell container.
 */
export function getCellDataTheme({
  theme,
  isIDColumn,
}: {
  theme: MantineTheme;
  isIDColumn: boolean;
}) {
  const cellTheme = theme.other?.table?.cell;
  const idTheme = theme.other?.table?.idColumn;

  const fontSize = cellTheme?.fontSize;

  if (isIDColumn) {
    return {
      color: idTheme?.textColor,
      fontSize,
      background:
        idTheme?.backgroundColor || alpha(theme.fn.themeColor("brand"), 0.08),
      border: `1px solid ${alpha(
        idTheme?.backgroundColor || theme.fn.themeColor("brand"),
        0.14,
      )}`,
    };
  }

  return { color: cellTheme?.textColor, fontSize };
}

export const getCellHoverBackground = ({
  theme,
}: {
  theme: MantineTheme;
}): string => {
  const brand = theme.fn.themeColor("brand");
  const background = theme.other?.table?.cell?.backgroundColor;

  if (background && isDark(background)) {
    return lighten(background, 0.1);
  }

  return alpha(brand, 0.1);
};
