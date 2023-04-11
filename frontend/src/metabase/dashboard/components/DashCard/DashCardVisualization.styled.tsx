import styled from "@emotion/styled";
import { lighten, color } from "metabase/lib/colors";

export const CardDownloadWidget = styled.div<any>`
  display: block;
  color: ${lighten("text-light", 0.1)};
  margin: 0 0 0 0.5rem;

  &:hover {
    color: ${color("brand")};
  }
`;
