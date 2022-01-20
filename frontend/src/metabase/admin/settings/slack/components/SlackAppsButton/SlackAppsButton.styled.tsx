import styled from "styled-components";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import ExternalLink from "metabase/components/ExternalLink";

export const ButtonRoot = styled(ExternalLink)`
  display: inline-flex;
  align-items: center;
  padding: 0.75rem 1.25rem;
`;

export const ButtonText = styled.div`
  font-weight: bold;
`;

export const ButtonIcon = styled(Icon)`
  color: ${color("white")};
  margin-left: 0.5rem;
  width: 0.75rem;
  height: 0.75rem;
`;
