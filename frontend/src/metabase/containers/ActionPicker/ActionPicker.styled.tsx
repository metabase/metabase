import _ from "underscore";
import styled from "@emotion/styled";

import { color, lighten } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

import UnstyledEmptyState from "metabase/components/EmptyState";

export const ModelActionList = styled.div`
  margin-bottom: ${space(2)};
  &:not(:last-child) {
    border-bottom: 1px solid ${color("border")};
  }
`;

export const ModelTitle = styled.h4`
  color: ${color("text-dark")};
  margin-bottom: ${space(2)};
  display: flex;
  align-items: center;
`;

export const ActionItem = styled.li`
  padding-left: ${space(3)};
  margin-bottom: ${space(2)};
  color: ${color("brand")};
  cursor: pointer;
  font-weight: bold;
  &:hover: {
    color: ${lighten("brand", 0.1)};
  }
`;

export const EmptyState = styled(UnstyledEmptyState)`
  margin-bottom: ${space(2)};
`;

export const EmptyModelStateContainer = styled.div`
  padding-bottom: ${space(2)};
  color: ${color("text-medium")};
  text-align: center;
`;
