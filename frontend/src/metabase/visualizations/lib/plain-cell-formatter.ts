import type { ContentTranslationFunction } from "metabase/content-translation/types";
import type { PlainCellFormatter } from "metabase/data-grid/types";
import { formatValue } from "metabase/value-formatting";
import type { ClickObject } from "metabase/visualizations/types";
import type { ColumnSettings } from "metabase-types/api";

export function createPlainCellFormatter<TValue = unknown>({
  columnSettings,
  translate,
  getClicked,
  copyLinkUrl,
}: {
  columnSettings?: ColumnSettings;
  translate: ContentTranslationFunction;
  getClicked?: (rowIndex: number, columnId: string) => ClickObject | undefined;
  copyLinkUrl?: boolean;
}): PlainCellFormatter<TValue> {
  const baseOptions = { ...columnSettings, type: "cell", copyLinkUrl };
  return (untranslatedValue, rowIndex, columnId) => {
    const clicked = getClicked?.(rowIndex, columnId);
    return String(
      formatValue(
        translate(untranslatedValue),
        clicked ? { ...baseOptions, clicked } : baseOptions,
      ),
    );
  };
}
