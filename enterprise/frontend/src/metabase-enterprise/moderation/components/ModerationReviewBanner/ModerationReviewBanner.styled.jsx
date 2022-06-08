import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Button from "metabase/core/components/Button";

export const Container = styled.div`
  padding: 1rem 0.5rem;
  display: flex;
  justify-content: space-between;
  align-items: start;
  column-gap: 1rem;
  border-radius: 8px;
`;

export const TextContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

export const Text = styled.span`
  font-size: 14px;
  line-height: 17px;
  font-weight: 700;
  margin-bottom: 4px;
`;

export const Time = styled.time`
  color: ${color("text-medium")};
  font-size: 12px;
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
