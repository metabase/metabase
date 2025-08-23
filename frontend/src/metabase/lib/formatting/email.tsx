import ExternalLink from "metabase/common/components/ExternalLink";
import { getDataFromClicked } from "metabase-lib/v1/parameters/utils/click-behavior";

import { renderLinkTextForClick } from "./link";
import type { OptionsType } from "./types";

// Updated regex to support Unicode characters in email addresses
// Based on RFC 6531 (Internationalized Email) and modern email standards
// Using \p{L} for Unicode letters, \p{N} for Unicode numbers, and the 'u' flag
const EMAIL_ALLOW_LIST_REGEX =
  /^(?=.{1,254}$)(?=.{1,64}@)[\p{L}\p{N}!#$%&'*+/=?^_`{|}~.-]+(?:\.[\p{L}\p{N}!#$%&'*+/=?^_`{|}~.-]+)*@[\p{L}\p{N}.-]+(?:\.[\p{L}\p{N}.-]+)*$/u;

export function formatEmail(
  value: string,
  { jsx, rich, view_as = "auto", link_text, clicked }: OptionsType = {},
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
    return (
      <ExternalLink href={"mailto:" + email}>{label || email}</ExternalLink>
    );
  } else {
    return email;
  }
}
