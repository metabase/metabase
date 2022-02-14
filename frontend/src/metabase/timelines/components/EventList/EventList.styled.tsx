import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const ListRoot = styled.div`
  overflow-y: auto;
`;

export const ListFooter = styled.div`
  margin-top: 0.125rem;
`;

export const ListThread = styled.div`
  height: 100%;
  border-left: 1px dashed ${color("border")};
`;

export const ListThreadContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 2rem;
  height: 2rem;
`;
