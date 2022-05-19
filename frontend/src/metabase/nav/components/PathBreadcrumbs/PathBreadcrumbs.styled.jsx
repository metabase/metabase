import styled from "styled-components";

import { color } from "metabase/lib/colors";
import Button from "metabase/core/components/Button";
import { space } from "metabase/styled-components/theme";

export const FilterHeaderContainer = styled.div`
  padding-left: ${space(3)};
  padding-bottom: ${space(2)};
  padding-right: ${space(2)};
`;

export const PathContainer = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: ${space(1)};
`;

export const PathSeparator = styled.div`
  display: flex;
  align-items: center;
  color: ${color("text-light")};
  margin-left: ${space(1)};
  margin-right: ${space(1)};
`;

export const ExpandButton = styled(Button)`
  border: none;
  padding: 0;
  padding-left: 4px;
  margin: 0;
`;