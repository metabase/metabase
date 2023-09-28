import { t } from "ttag";
import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import type { ButtonProps } from "metabase/ui";
import { Button } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";

export const BackButton = styled(Button)<
  ButtonProps & { "aria-label"?: string; onClick: () => void }
>`
  padding: 0;
  color: ${color("text-dark")};
  font-size: 1.17em;
`;

BackButton.defaultProps = {
  variant: "subtle",
  leftIcon: <Icon name="chevronleft" />,
  "aria-label": t`Back`,
};
