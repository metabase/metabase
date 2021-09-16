import styled from "styled-components";

import Select from "metabase/components/Select";

export const Container = styled.div`
  display: flex;
  justify-content: space-between;
`;

export const StyledSelect = styled(Select)`
  width: 30%;
`;

export const Input = styled.input`
  width: calc(70% - 10px);
`;
