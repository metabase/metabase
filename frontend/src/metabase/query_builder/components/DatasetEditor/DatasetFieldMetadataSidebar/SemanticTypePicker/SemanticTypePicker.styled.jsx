import styled from "styled-components";

import SelectButton from "metabase/components/SelectButton";

import { forwardRefToInnerRef } from "metabase/styled-components/utils";

export const StyledSelectButton = forwardRefToInnerRef(styled(SelectButton)`
  width: 100%;
`);

export const ExtraSelectContainer = styled.div`
  margin-top: 1em;
`;
