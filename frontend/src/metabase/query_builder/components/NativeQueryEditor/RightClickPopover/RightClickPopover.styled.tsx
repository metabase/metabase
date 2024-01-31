import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

export const Container = styled.div`
  display: flex;
  flex-direction: column;
`;

export const Anchor = styled.a`
  display: flex;
  padding: ${space(2)};

  &:hover {
    background-color: ${color("bg-medium")};
  }
`;

export const IconStyled = styled(Icon)`
  margin-right: ${space(1)};
`;
