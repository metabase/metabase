import styled from "@emotion/styled";
import { Icon } from "metabase/core/components/Icon";
import { color, lighten } from "metabase/lib/colors";
import ExternalLink from "metabase/core/components/ExternalLink";

export const DataPermissionsHelpRoot = styled.div`
  h2 {
    margin-top: 2rem;
    margin-bottom: 1rem;
    font-size: 18px;
    line-height: 20px;

    &:first-of-type {
      margin-top: 8px;
    }
  }

  h3 {
    margin-top: 1.5rem;
    font-size: 14px;
    line-height: 20px;
  }

  h2 + h3 {
    margin-top: 1rem;
  }

  p {
    font-size: 13px;
    line-height: 18px;
    margin: 0.5rem 0;
  }
`;

export const PermissionIcon = styled(Icon)`
  padding-right: 0.375rem;
  vertical-align: text-bottom;
  color: ${props => color(props.color)};
`;

PermissionIcon.defaultProps = { size: 16 };

export const DataPermissionsHelpContent = styled.div`
  padding: 1rem 2rem;
`;

export const DataPermissionsHelpFooter = styled.footer`
  padding: 2rem;
  border-top: 1px solid ${color("border")};
`;

export const DataPermissionsHelpLink = styled(ExternalLink)`
  display: flex;
  align-items: center;
  padding: 16px 24px;
  font-size: 14px;
  font-weight: 700;
  line-height: 20px;
  color: ${color("text-dark")};
  border: 1px solid ${color("border")};
  border-radius: 8px;
  transition: all 200ms;

  &:hover {
    border-color: ${color("brand")};
    background-color: ${lighten("brand", 0.6)};
  }
`;

export const DataPermissionsHelpLinkIcon = styled(Icon)`
  color: ${color("text-light")};
  margin-right: 1rem;
`;
