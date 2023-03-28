import styled from "@emotion/styled";
import ButtonBar from "metabase/components/ButtonBar";
import ViewSection from "metabase/query_builder/components/view/ViewSection";

export const QueryFooterRoot = styled(ViewSection)`
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
`;

export const QueryFooterButtonbar = styled(ButtonBar)`
  flex: 1 0 auto;
`;
