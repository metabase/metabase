import styled from "styled-components";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const FormTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.5rem;
  text-align: center;
  margin-bottom: 1rem;
`;

export const FormMessage = styled.div`
  color: ${color("text-dark")};
  text-align: center;
  margin-bottom: 1.5rem;
`;

export const SuccessBody = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const SuccessIcon = styled(Icon)`
  display: block;
  color: ${color("brand")};
  width: 1.5rem;
  height: 1.5rem;
`;

export const SuccessIconContainer = styled.div`
  padding: 1.25rem;
  border-radius: 50%;
  background-color: ${color("brand-light")};
  margin-bottom: 1.5rem;
`;

export const SuccessTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.5rem;
  text-align: center;
  margin-bottom: 1rem;
`;

export const SuccessMessage = styled.div`
  color: ${color("text-dark")};
  text-align: center;
  margin-bottom: 2.5rem;
`;
