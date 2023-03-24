import styled from "@emotion/styled";
import ViewSection from "metabase/query_builder/components/view/ViewSection";
import { color } from "metabase/lib/colors";

export const QueryFooterRoot = styled(ViewSection)`
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
  border-top: 1px solid ${color("border")};
`;
