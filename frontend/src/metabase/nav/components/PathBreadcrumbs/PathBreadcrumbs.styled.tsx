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
  padding: 0 5px;
  margin: 0;
  background-color: ${color("bg-light")};
  border-radius: 2px;
  color: ${color("text-medium")};

  &:hover {
    color: ${color("text-white")};
    background-color: ${color("brand")};
  }
`;
