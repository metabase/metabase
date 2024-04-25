import ExternalLink from "metabase/core/components/ExternalLink";
import { getDataFromClicked } from "metabase-lib/v1/parameters/utils/click-behavior";

import { renderLinkTextForClick } from "./link";
import type { OptionsType } from "./types";

// https://github.com/angular/angular.js/blob/v1.6.3/src/ng/directive/input.js#L27
const EMAIL_ALLOW_LIST_REGEX =
  /^(?=.{1,254}$)(?=.{1,64}@)[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+(\.[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+)*@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

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
