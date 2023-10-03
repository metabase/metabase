import { t } from "ttag";
import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Button from "metabase/core/components/Button";

export const BackButton = styled(Button)`
  padding: 0;
  color: ${color("text-dark")};
  font-size: 1.17em;

  &:hover {
    color: ${color("brand")};
  }
`;

BackButton.defaultProps = {
  borderless: true,
  onlyText: true,
  icon: "chevronleft",
  "aria-label": t`Back`,
};
