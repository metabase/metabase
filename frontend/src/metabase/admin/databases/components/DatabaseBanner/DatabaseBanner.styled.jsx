import styled from "styled-components";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const BannerRoot = styled.div`
  display: flex;
  padding: 1rem 2rem;
  align-items: center;
  background-color: ${color("bg-light")};
`;

export const BannerWarning = styled(Icon)`
  color: ${color("accent5")};
  width: 1.5rem;
  height: 1.5rem;
`;

export const BannerContent = styled.div`
  color: ${color("text-dark")};
  margin: 0 0.5rem;
`;
