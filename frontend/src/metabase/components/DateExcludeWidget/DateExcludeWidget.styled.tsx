import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const Container = styled.div`
  display: flex;
  flex-wrap: no-wrap;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid ${color("border")};
  border-bottom: 1px solid ${color("border")};
  padding: ${space(2)};
`;
