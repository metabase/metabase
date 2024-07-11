import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const FieldTypeIcon = styled(Icon)`
  color: ${props =>
    props.name === "ellipsis" ? color("text-white") : color("brand")};
  margin-right: 6px;

  ${props =>
    props.name === "ellipsis" &&
    css`
      border-radius: 0.3em;
      padding: 0.2em;
      background-color: ${color("text-dark")};
    `}
`;

FieldTypeIcon.defaultProps = { size: 14 };
