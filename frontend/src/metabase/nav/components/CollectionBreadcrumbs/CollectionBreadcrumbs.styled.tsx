import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";

export const PathContainer = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
`;

export const PathSeparator = styled.div`
  display: flex;
  align-items: center;
  color: ${color("text-light")};
  font-size: 0.8em;
  font-weight: bold;
  margin-left: 0.5rem;
  margin-right: 0.5rem;
  user-select: none;
`;

export const ExpandButton = styled(Button)`
  border: none;
  margin: 0;
  padding: 0.25rem;
  background-color: ${color("bg-light")};
  border-radius: 2px;
  color: ${color("text-medium")};

  &:hover {
    color: ${color("text-white")};
    background-color: ${color("brand")};
  }
`;
