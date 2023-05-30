import styled from "@emotion/styled";
import { ColorRange } from "metabase/core/components/ColorRange";
import { Button } from "metabase/core/components/Button";

export const ToggleRoot = styled.div`
  display: flex;
`;

export const ToggleColorRange = styled(ColorRange)`
  flex: 1 1 auto;
  cursor: default;
`;

export const ToggleButton = styled(Button)`
  flex: 0 0 auto;
  margin-left: 0.375rem;
`;
