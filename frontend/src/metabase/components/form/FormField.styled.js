import styled from "styled-components";
import Icon from "metabase/components/Icon";

import { color } from "metabase/lib/colors";

export const FieldRow = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 0.5em;
`;

export const Label = styled.label`
  margin-bottom: 0;
`;

export const InfoIcon = styled(Icon).attrs({ name: "info", size: 12 })`
  margin-left: 8px;
  color: ${color("bg-dark")};

  &:hover {
    color: ${color("brand")};
  }
`;
