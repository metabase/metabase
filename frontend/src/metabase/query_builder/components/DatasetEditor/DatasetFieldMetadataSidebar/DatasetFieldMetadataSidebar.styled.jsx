import styled from "styled-components";

const CONTENT_PADDING = "24px";

export const MainFormContainer = styled.div`
  padding: ${CONTENT_PADDING} ${CONTENT_PADDING} 0 ${CONTENT_PADDING};
`;

export const SecondaryFormContainer = styled.div`
  padding: 0 ${CONTENT_PADDING} ${CONTENT_PADDING} ${CONTENT_PADDING};
`;

export const ViewAsFieldContainer = styled.div`
  font-weight: bold;
`;

export const FormTabsContainer = styled.div`
  padding-left: ${CONTENT_PADDING};
  padding-right: ${CONTENT_PADDING};
`;
