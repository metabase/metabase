import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";

import Input from "metabase/core/components/Input";

export const RangeContainer = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  margin: ${space(1)} 0;
`;

export const RangeNumberInput = styled(Input)`
  width: 10rem;
`;
