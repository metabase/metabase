import { ExternalLink } from "metabase/common/components/ExternalLink";
import { getDataFromClicked } from "metabase/parameters/utils/click-behavior";
import { isEmail } from "metabase/utils/email";
import { removeNewLines } from "metabase/utils/formatting/strings";
import type { OptionsType } from "metabase/utils/formatting/types";

import { renderLinkTextForClick } from "./link";

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
