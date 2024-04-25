import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";

export const Container = styled.div`
  padding: 1rem 0;
  display: flex;
  justify-content: space-between;
  align-items: start;
  column-gap: 0.5rem;
  border-radius: 8px;
`;

export const TextContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

export const Text = styled.span`
  font-size: 0.875rem;
  line-height: 1rem;
  margin-bottom: 0.25rem;
  font-weight: 700;
`;

export const Time = styled.time`
  color: ${color("text-medium")};
  font-size: 0.766rem;
  line-height: 1.25rem;
`;

export const IconButton = styled(Button)`
  padding: 0 !important;
  border: none;
  background-color: transparent;

  &:hover {
    background-color: transparent;
    color: ${color("danger")};
  }
`;
