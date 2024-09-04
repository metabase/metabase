import styled from "@emotion/styled";

import Label from "metabase/components/type/Label";

export const LoginGroup = styled.div`
  padding: 0rem 0;
`;

export const LoginItemContent = styled.div`
  display: flex;
  align-items: center;
`;

export const LoginItemInfo = styled.div`
  display: flex;
  margin-left: auto;
`;

export const LoginActiveLabel = styled(Label)`
  background-color: #cfe6c9;
  border-radius: 99px;
  color: #29920e;
  fontweight: 400;
  padding-left: 1rem;
  padding-right: 1rem;
`;

export const LoginInactiveLabel = styled(Label)`
  background-color: #e0e4e9;
  border-radius: 99px;
  color: #8f9296;
  font-weight: 400;
  padding-left: 1rem;
  padding-right: 1rem;
`;
