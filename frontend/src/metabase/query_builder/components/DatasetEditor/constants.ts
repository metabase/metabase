/**
 * Tab-indexes configuring a special tab-order for metadata editor
 * Allows to tab through dataset columns and their essential metadata fields
 *
 * Order
 * 1. Column A
 * 2. Column A's fields: "Display name", "Description", "Special type" picker
 * 3. Column B (next)
 * 4. Column B's fields
 * 5. Column C and so on
 */
export const EDITOR_TAB_INDEXES = {
  PREVIOUS_FIELDS: "1",
  FOCUSED_FIELD: "2",
  ESSENTIAL_FORM_FIELD: "3",
  NEXT_FIELDS: "4",
};
