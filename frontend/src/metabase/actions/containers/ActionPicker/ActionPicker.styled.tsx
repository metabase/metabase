import _ from "underscore";
import styled from "@emotion/styled";

import { color, lighten } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

import UnstyledEmptyState from "metabase/components/EmptyState";
import Button from "metabase/core/components/Button";

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
  justify-content: space-between;
`;

export const ActionItem = styled.li`
  display: flex;
  justify-content: space-between;
  padding-left: ${space(3)};
  margin-bottom: ${space(2)};
`;

export const ActionName = styled.span`
  color: ${color("brand")};
  font-weight: bold;
  cursor: pointer;
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

export const EditButton = styled(Button)`
  color: ${color("text-light")};
  padding: 0 0.5rem;
`;
