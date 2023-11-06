import styled from "@emotion/styled";

interface ObjectDetailContainerProps {
  wide: boolean;
}

export const ObjectDetailContainer = styled.div<ObjectDetailContainerProps>`
  overflow-y: auto;
  height: 100%;
`;

export const ObjectDetailWrapperDiv = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
`;

export const ErrorWrapper = styled.div`
  height: 480px;
  display: flex;
  justify-content: center;
  align-items: center;
`;
