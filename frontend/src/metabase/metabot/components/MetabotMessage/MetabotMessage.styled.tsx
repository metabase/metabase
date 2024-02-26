import styled from "@emotion/styled";

import MetabotLogo from "metabase/core/components/MetabotLogo";
import { color } from "metabase/lib/colors";

export const MetabotMessageRoot = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

export const MetabotIcon = styled(MetabotLogo)`
  width: 3.375rem;
  height: 2.5rem;
`;

export const MetabotText = styled.div`
  display: inline-block;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  background-color: ${color("bg-light")};
  color: ${color("text-medium")};
  font-weight: bold;
`;
