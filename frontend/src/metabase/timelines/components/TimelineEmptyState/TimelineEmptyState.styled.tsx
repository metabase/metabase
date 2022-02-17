import styled from "@emotion/styled";
import { alpha, color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const StateRoot = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const StateBody = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 22.5rem;
`;

export const StateChart = styled.div`
  color: ${color("brand")};
  margin-bottom: 3.5rem;
`;

export const StateThread = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 1.5rem;
`;

export const StateThreadLine = styled.div`
  margin: 0 0.5rem;
  width: 11.75rem;
  height: 1px;
  background-color: ${alpha("brand", 0.2)};
`;

export const StateThreadIcon = styled(Icon)`
  color: ${color("white")};
  width: 1rem;
  height: 1rem;
`;

export const StateThreadIconContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 1rem;
  background-color: ${color("brand")};
`;

export const StateMessage = styled.div`
  color: ${color("text-dark")};
  line-height: 1.5rem;
  margin-bottom: 2rem;
  text-align: center;
`;
