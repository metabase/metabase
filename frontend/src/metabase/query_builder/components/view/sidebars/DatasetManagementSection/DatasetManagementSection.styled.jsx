import styled from "styled-components";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const SectionTitle = styled.span`
  font-size: 12px;
  font-weight: 900;
  color: ${color("text-medium")};
`;

export const ActionItemContainer = styled.div`
  display: flex;
  align-items: center;
  margin-top: 1rem;

  cursor: pointer;
  color: ${color("brand")};
  font-weight: 700;

  .Icon {
    margin-right: ${space(1)};
  }
`;
