import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { Icon } from "metabase/core/components/Icon";
import { color } from "metabase/lib/colors";

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
