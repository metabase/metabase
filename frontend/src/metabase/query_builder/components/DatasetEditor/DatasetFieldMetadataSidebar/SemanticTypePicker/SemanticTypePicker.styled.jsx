import styled, { css } from "styled-components";

import { color } from "metabase/lib/colors";

import Icon from "metabase/components/Icon";

export const FieldTypeIcon = styled(Icon).attrs({ size: 14 })`
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
