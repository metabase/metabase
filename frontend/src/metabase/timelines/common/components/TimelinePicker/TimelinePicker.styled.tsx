import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const CardRoot = styled.div`
  display: flex;
  align-items: center;
  padding: 1rem;
`;

export const CardIconContainer = styled.div`
  display: flex;
  flex: 0 0 auto;
  justify-content: center;
  align-items: center;
  width: 2rem;
  height: 2rem;
  border: 1px solid ${color("border")};
`;

export const CardIcon = styled(Icon)`
  color: ${color("text-dark")};
  width: 1rem;
  height: 1rem;
`;

export const CardBody = styled.div`
  flex: 1 1 auto;
  margin: 0 1rem;
  min-width: 0;
`;

export const CardTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 1rem;
  font-weight: bold;
  margin-bottom: 0.125rem;
  word-wrap: break-word;
`;

export const CardDescription = styled.div`
  color: ${color("text-medium")};
  font-size: 0.75rem;
  word-wrap: break-word;
`;

export const CardCount = styled.div`
  flex: 0 0 auto;
  color: ${color("text-dark")};
  font-size: 0.75rem;
`;
