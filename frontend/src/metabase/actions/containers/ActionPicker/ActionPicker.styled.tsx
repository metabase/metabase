import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

import UnstyledEmptyState from "metabase/components/EmptyState";
import Button from "metabase/core/components/Button";
import CollapseSection from "metabase/components/CollapseSection";

export const ModelCollapseSection = styled(CollapseSection)`
  margin-bottom: ${space(1)};
`;

export const ActionItem = styled.li`
  display: flex;
  justify-content: space-between;
  margin: 1rem 1.5rem;
`;

export const EmptyState = styled(UnstyledEmptyState)`
  margin-bottom: ${space(2)};
`;

export const EmptyModelStateContainer = styled.div`
  padding: ${space(2)};
  color: ${color("text-medium")};
  text-align: center;
`;

export const EditButton = styled(Button)`
  color: ${color("text-light")};
  padding: 0 0.5rem;
`;
