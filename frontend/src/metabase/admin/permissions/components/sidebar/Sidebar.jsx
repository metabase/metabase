import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const Sidebar = styled.aside`
  width: 300px;
  height: 100%;
  border-right: 1px solid ${color("border")};
`;

Sidebar.Header = styled.div`
  padding: 1rem;
  border-bottom: 1px solid ${color("border")};
`;

Sidebar.Content = styled.div`
  padding: 1rem 0;
  overflow-y: auto;
`;
