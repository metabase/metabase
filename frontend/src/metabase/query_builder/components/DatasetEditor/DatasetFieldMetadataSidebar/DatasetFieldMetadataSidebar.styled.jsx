import styled from "styled-components";
import { color } from "metabase/lib/colors";

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

export const Divider = styled.div`
  height: 1px;
  width: 100%;
  background-color: ${color("bg-medium")};
  margin-bottom: 1.5em;
`;
