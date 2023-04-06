import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Button from "metabase/core/components/Button/Button";

export const Header = styled.div`
  color: ${color("text-medium")};
  padding: 1rem 1.5rem;
  border-bottom: 1px solid ${color("border")};

  display: flex;
  align-items: center;
`;

export const HeaderButton = styled(Button)`
  color: ${color("text-light")};
`;
