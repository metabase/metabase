import styled from "@emotion/styled";
import QueryDownloadMenu from "metabase/query_builder/components/QueryDownloadMenu";
import { lighten, color } from "metabase/lib/colors";

export const CardDownloadMenu = styled(QueryDownloadMenu)`
  display: block;
  color: ${lighten("text-light", 0.1)};
  margin: 0 0 0 0.5rem;

  &:hover {
    color: ${color("brand")};
  }
`;
