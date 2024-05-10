import type { EmbeddingTheme } from "embedding-sdk/types/theme/private";

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
      color: idTheme?.textColor || color,
      background: idTheme?.backgroundColor || background,
    };
  }

  return { color, background };
}
