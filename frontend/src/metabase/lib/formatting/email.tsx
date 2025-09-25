import ExternalLink from "metabase/common/components/ExternalLink";
import { getDataFromClicked } from "metabase-lib/v1/parameters/utils/click-behavior";

import { renderLinkTextForClick } from "./link";
import { removeNewLines } from "./strings";
import type { OptionsType } from "./types";

// Enhanced email regex with Unicode support for international characters
// Uses Unicode character classes to support international domains and names
// Based on RFC 5322 with practical constraints for security and usability
const EMAIL_ALLOW_LIST_REGEX =
  /^(?=.{1,254}$)(?=.{1,64}@)[\p{L}\p{N}!#$%&'*+\/=?\^`{|}~_-]+(?:\.[\p{L}\p{N}!#$%&'*+\/=?\^`{|}~_-]+)*@[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?(?:\.[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?)*$/u;

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
    EMAIL_ALLOW_LIST_REGEX.test(email)
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
