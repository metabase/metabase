import styled from "@emotion/styled";

import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";

export const Item = styled.div`
  display: flex;
align-items: center;
  cursor: pointer;
  color: ${color("text-medium")};
  padding: 0.85em 1.45em;
  text-decoration: none;
  transition: all 300ms linear;
  :hover {
    color: ${color("brand")};
  }
  > .Icon {
    color: ${color("text-light")};
    margin-right: 0.65em;
  }
  :hover > .Icon {
    color: ${color("brand")};
    transition: all 300ms linear;
  },
  /* icon specific tweaks
     the alert icon should be optically aligned  with the x-height of the text */
  > .Icon.Icon-alert {
    transform: translate-y(1px),
}
  /* the embed icon should be optically aligned with the x-height of the text */
  > .Icon.Icon-embed {
    transform: translate-y(1px);
  }
  /* the download icon should be optically aligned with the x-height of the text */
  > .Icon.Icon-download: {
    transform: translate-y(1px);
  }
  /* the history icon is wider so it needs adjustment to center it with other
   icons */
  "> .Icon.Icon-history": {
    transform: translate-x(-2px);
  },
`;

export const StyledExternalLink = styled(ExternalLink)`
  text-decoration: none;
  display: block;
`;
