import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const WidgetRoot = styled.div`
  width: 31.25rem;
  padding: 2rem;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  box-shadow: 0 2px 2px ${color("shadow")};
  background-color: ${color("white")};
`;

export const WidgetHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
`;

export const WidgetTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 1.5rem;
  font-weight: bold;
`;

export const WidgetDescription = styled.div`
  color: ${color("text-dark")};
  font-size: 0.875rem;
  line-height: 1.5rem;
  margin-bottom: 1.5rem;
`;
