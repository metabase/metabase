import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Button from "metabase/core/components/Button";

interface ChartSettingOrderedSimpleRootProps {
  paddingLeft?: string;
}

export const ChartSettingOrderedSimpleRoot = styled.div<ChartSettingOrderedSimpleRootProps>`
  padding-left: ${({ paddingLeft }) => paddingLeft || "1rem"};
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
`;

export const ChartSettingMessage = styled.div`
  margin: 1rem 0;
  padding: 1rem;
  display: flex;
  justify-content: center;
  align-items: center;
  background: ${color("bg-light")};
  color: ${color("text-light")};
  font-weight: 700;
  border-radius: 0.5rem;
`;

export const ExtraButton = styled(Button)`
  position: absolute;
  top: 0;
  right: 0;
`;
