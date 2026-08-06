import { isEmail } from "metabase/utils/email";
import { removeNewLines } from "metabase/utils/formatting/strings";
import type { ColumnSettings } from "metabase-types/api";

import { getDataFromClicked } from "./click-data";
import { renderLinkTextForClick } from "./link";
import { getJsxEmailRenderer } from "./registry";

export function formatEmail(
  value: string,
  {
    jsx,
    rich,
    view_as = "auto",
    link_text,
    clicked,
    collapseNewlines,
  }: ColumnSettings = {},
) {
  const email = String(value);
  const label =
    clicked && link_text
      ? renderLinkTextForClick(link_text, getDataFromClicked(clicked))
      : null;

  const renderJsxEmail = getJsxEmailRenderer();
  if (
    jsx &&
    rich &&
    renderJsxEmail &&
    (view_as === "email_link" || view_as === "auto") &&
    isEmail(email)
  ) {
    let displayText = label || email;
    if (collapseNewlines) {
      displayText = removeNewLines(displayText);
    }
    return renderJsxEmail("mailto:" + email, displayText);
  } else {
    return collapseNewlines ? removeNewLines(email) : email;
  }
}
