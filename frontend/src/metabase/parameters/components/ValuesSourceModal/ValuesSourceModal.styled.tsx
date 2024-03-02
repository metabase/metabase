import styled from "@emotion/styled";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

export const ModalBody = styled.div`
  height: 50vh;
`;

export const ModalLoadingAndErrorWrapper = styled(LoadingAndErrorWrapper)`
  display: flex;
  justify-content: center;
  align-items: center;
  height: calc(50vh + 11.25rem);
`;
