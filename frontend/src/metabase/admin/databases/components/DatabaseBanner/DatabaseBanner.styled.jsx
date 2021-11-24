import styled from "styled-components";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

export const BannerRoot = styled.div`
  display: flex;
  padding: 1rem 1rem 1rem 2rem;
  align-items: center;
  background-color: ${color("bg-light")};
`;

export const BannerContent = styled.div`
  flex: 1 1 auto;
  margin: 0 0.5rem;
  color: ${color("text-dark")};
`;

export const BannerLink = styled(Link)`
  color: ${color("brand")};
  font-weight: bold;
`;

export const BannerWarningIcon = styled(Icon)`
  color: ${color("accent5")};
  width: 1.5rem;
  height: 1.5rem;
`;

export const BannerCloseIcon = styled(Icon)`
  color: ${color("bg-dark")};
  width: 1.5rem;
  height: 1.5rem;
  cursor: pointer;
`;
