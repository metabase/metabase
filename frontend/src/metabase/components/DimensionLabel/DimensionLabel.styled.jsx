import styled from "styled-components";

import { space } from "metabase/styled-components/theme";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const Container = styled.div`
  display: inline-flex;
  align-items: center;
  column-gap: ${space(0)};
  font-size: 12px;
`;

export const Label = styled.span`
  font-weight: 900;
  color: ${color("brand")};
  font-size: 1em;
`;

export const PaddedInvertedColorIcon = styled(Icon)`
  background-color: ${color("brand")};
  color: ${color("white")};
  border-radius: ${space(0)};
  padding: ${space(0)};
  height: 1em;
  width: 1em;
`;
