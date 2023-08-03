import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Link from "metabase/core/components/Link";

interface ErrorLinkProps {
  isActive: boolean;
}

export const ErrorLink = styled(Link)<ErrorLinkProps>`
  color: ${props => props.isActive && color("brand")};
`;
