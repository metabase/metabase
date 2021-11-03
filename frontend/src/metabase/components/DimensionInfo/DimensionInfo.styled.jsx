import styled from "styled-components";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${space(2)};
  padding: ${space(2)};
  overflow: auto;
`;

export const Description = styled.div`
  font-size: 14px;
`;

export const EmptyDescription = styled(Description)`
  color: ${color("text-light")};
  font-weight: 700;
`;
