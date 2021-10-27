import styled from "styled-components";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import { color } from "metabase/lib/colors";

export const AccordionSpinner = styled(LoadingSpinner)`
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin-left: auto;
  color: ${color("brand")};
`;
