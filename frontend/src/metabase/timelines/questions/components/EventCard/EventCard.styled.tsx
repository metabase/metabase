import styled from "@emotion/styled";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

export const CardRoot = styled.div`
  display: flex;
`;

export const CardThread = styled.div`
  flex: 0 1 auto;
`;

export const CardThreadIcon = styled(Icon)`
  color: ${color("brand")};
  width: 1rem;
  height: 1rem;
`;

export const CardBody = styled.div`
  flex: 1 1 auto;
  padding: 0.25rem 0.75rem 0.5rem;
`;

export const CardTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 1rem;
  line-height: 1.25rem;
  font-weight: bold;
`;

export const CardDescription = styled.div`
  color: ${color("text-dark")};
  margin-top: 0.25rem;
`;

export const CardDateInfo = styled.div`
  color: ${color("brand")};
  font-size: 0.75rem;
  line-height: 1.5rem;
  font-weight: bold;
`;

export const CardCreatorInfo = styled.div`
  color: ${color("text-medium")};
  margin-top: 0.75rem;
`;
