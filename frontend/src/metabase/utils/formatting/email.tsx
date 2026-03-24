import { ExternalLink } from "metabase/common/components/ExternalLink";
import { isEmail } from "metabase/lib/email";
import { getDataFromClicked } from "metabase-lib/v1/parameters/utils/click-behavior";

import { renderLinkTextForClick } from "./link";
import { removeNewLines } from "./strings";
import type { OptionsType } from "./types";

export function formatEmail(
  value: string,
  {
    jsx,
    rich,
    view_as = "auto",
    link_text,
    clicked,
    collapseNewlines,
  }: OptionsType = {},
) {
  const email = String(value);
  const label =
    clicked && link_text
      ? renderLinkTextForClick(link_text, getDataFromClicked(clicked) as any)
      : null;

  if (
    jsx &&
    rich &&
    (view_as === "email_link" || view_as === "auto") &&
    isEmail(email)
  ) {
    let displayText = label || email;
    if (collapseNewlines) {
      displayText = removeNewLines(displayText);
    }
    return <ExternalLink href={"mailto:" + email}>{displayText}</ExternalLink>;
  } else {
    return collapseNewlines ? removeNewLines(email) : email;
  }
}
