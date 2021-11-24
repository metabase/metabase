import styled from "styled-components";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const BannerRoot = styled.div`
  background-color: ${color("bg-light")};
  padding: 1rem 2rem;
`;

export const BannerWarning = styled(Icon)`
  color: ${color("warning")};
`;

export const BannerContent = styled.div`
  color: ${color("warning")};
`;
