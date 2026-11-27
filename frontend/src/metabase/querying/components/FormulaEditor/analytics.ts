import { trackSimpleEvent } from "metabase/analytics";

export type FormulaBarTriggerLocation =
  | "summary_values"
  | "summary_columns"
  | "summary_rows"
  | "table";

export type FormulaBarOpenedEventDetail =
  | "equals_sign"
  | "formula_option"
  | "generated_formula"
  | "chip_edit"
  | "column_header"
  | "add_column_button";

export type FormulaBarSubmittedEventDetail = "new" | "edit";

export type FormulaBarSubmittedResult =
  | "success"
  | "invalid"
  | "unsupported_function";

export const trackFormulaBarOpened = (
  location: FormulaBarTriggerLocation,
  detail: FormulaBarOpenedEventDetail,
) => {
  trackSimpleEvent({
    event: "formula_bar_opened",
    triggered_from: location,
    event_detail: detail,
  });
};

export const trackFormulaBarSubmitted = (
  location: FormulaBarTriggerLocation,
  detail: FormulaBarSubmittedEventDetail,
  result: FormulaBarSubmittedResult,
) => {
  trackSimpleEvent({
    event: "formula_bar_submitted",
    triggered_from: location,
    event_detail: detail,
    result,
  });
};
