import styled from "styled-components";
import { color } from "metabase/lib/colors";
import Button from "metabase/core/components/Button";

export const PathContainer = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
`;

export const PathSeparator = styled.div`
  display: flex;
  align-items: center;
  color: ${color("text-light")};
  margin-left: 0.5rem;
  margin-right: 0.5rem;
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
