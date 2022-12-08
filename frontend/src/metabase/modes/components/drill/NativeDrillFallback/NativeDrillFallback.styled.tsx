import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import ExternalLink from "metabase/core/components/ExternalLink";

export const DrillRoot = styled.div`
  max-width: 10.75rem;
`;

export const DrillMessage = styled.div`
  color: ${color("text-dark")};
  font-weight: bold;
  line-height: 1.5rem;
  margin-bottom: 0.5rem;
`;

export const DrillLearnLink = styled(ExternalLink)`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: ${color("brand")};
`;
