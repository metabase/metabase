import styled from "@emotion/styled";

import Loading from "metabase/components/Loading";

export const ModalBody = styled.div`
  height: 50vh;
`;

export const ModalLoading = styled(Loading)`
  display: flex;
  justify-content: center;
  align-items: center;
  height: calc(50vh + 11.25rem);
`;
