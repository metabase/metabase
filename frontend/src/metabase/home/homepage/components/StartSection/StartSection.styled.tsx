import { Link } from "react-router";
import styled from "styled-components";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";

interface ListRootProps {
  hasMargin?: boolean;
}

export const ListRoot = styled.div<ListRootProps>`
  display: grid;
  grid-template-columns: repeat(1, 1fr);
  gap: 1rem;
  margin-top: ${props => (props.hasMargin ? "2.5rem" : "")};
  overflow: hidden;

  ${breakpointMinSmall} {
    grid-template-columns: repeat(2, 1fr);
  }

  ${breakpointMinMedium} {
    grid-template-columns: repeat(3, 1fr);
  }
`;

export const CardRoot = styled(Link)`
  display: block;
  padding: 1.5rem;
  color: ${color("text-dark")};
  border: 1px solid ${color("border")};
  border-radius: 0.375rem;
  background-color: ${color("white")};
  box-shadow: 0 1px 2px ${color("shadow")};
  overflow: hidden;

  &:hover {
    color: ${color("brand")};
  }
`;

export const CardIcon = styled(Icon)`
  display: block;
  color: ${color("brand")};
  width: 1.5rem;
  height: 1.5rem;
`;

export const CardTitle = styled.span`
  display: block;
  font-weight: 700;
  margin-top: 2.25rem;
  overflow: hidden;
`;

export const BannerIconContainer = styled.div`
  display: flex;
  flex: 0 0 auto;
  justify-content: center;
  align-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border: 1px solid ${color("border")};
  border-radius: 50%;
`;

export const BannerModelIcon = styled(Icon)`
  display: block;
  color: ${color("brand")};
  width: 1rem;
  height: 1rem;
`;

export const BannerCloseIcon = styled(Icon)`
  display: block;
  color: ${color("text-medium")};
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;

export const BannerContent = styled.div`
  flex: 1 1 auto;
  margin: 0 1rem;
`;

export const BannerTitle = styled.div`
  color: ${color("text-dark")};
  font-weight: 700;
`;

export const BannerDescription = styled.div`
  color: ${color("text-medium")};
  margin-top: 0.5rem;
`;

export const BannerRoot = styled.div`
  display: flex;
  align-items: center;
  padding: 1.5rem;
  border: 1px solid ${color("border")};
  border-radius: 0.375rem;
  background-color: ${color("white")};

  ${BannerCloseIcon} {
    visibility: collapse;
  }

  &:hover ${BannerCloseIcon} {
    visibility: visible;
  }
`;
