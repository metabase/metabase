import css from "@emotion/css";
import styled from "@emotion/styled";
import CollapseSection from "metabase/components/CollapseSection";
import { HeaderContainer } from "metabase/components/CollapseSection/CollapseSection.styled";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const Header = styled.h3`
  font-size: 1.25rem;
`;

export const Paragraph = styled.p`
  line-height: 1.5;
  color: ${color("text-medium")};
`;

export const StyledCollapseSection = styled(CollapseSection)`
  margin-top: ${space(3)};
  margin-bottom: ${space(3)};

  ${HeaderContainer} {
    font-weight: 700;
    color: ${color("brand")};
  }
`;
