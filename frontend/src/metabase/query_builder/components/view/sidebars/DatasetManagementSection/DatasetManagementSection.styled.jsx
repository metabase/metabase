import styled from "styled-components";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const SectionTitle = styled.span`
  font-size: 12px;
  font-weight: 900;
  color: ${color("text-medium")};
`;

export const Button = styled.button`
  display: flex;
  align-items: center;
  margin-top: 1rem;
  padding: 0;

  color: ${color("brand")};
  font-family: var(--default-font-family);
  font-weight: 700;
  cursor: pointer;

  .Icon {
    margin-right: ${space(1)};
  }
`;
