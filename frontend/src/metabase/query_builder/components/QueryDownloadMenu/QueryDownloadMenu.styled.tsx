import styled from "@emotion/styled";
import { color, lighten } from "metabase/lib/colors";
import EntityMenu from "metabase/components/EntityMenu";

export const DownloadMenuRoot = styled(EntityMenu)`
  display: block;
  color: ${lighten("text-light", 0.1)};
  margin: 0 0 0 0.5rem;

  &:hover {
    color: ${color("brand")};
  }
`;
