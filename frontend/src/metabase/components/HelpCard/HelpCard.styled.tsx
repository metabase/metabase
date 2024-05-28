import { css } from "@emotion/react";
import styled from "@emotion/styled";

import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

const CardRootMixin = css`
  display: block;
  padding: 1.5rem;
  border: 1px solid ${color("border")};
  border-radius: 0.375rem;
  background-color: ${color("white")};
  box-shadow: 0 1px 6px ${color("shadow")};
  box-sizing: border-box;
`;

const CardHeaderMixin = css`
  display: flex;
  align-items: center;
  margin-bottom: 1rem;
`;

export const CardRootStatic = styled.div`
  ${CardRootMixin};
`;

export const CardRootLink = styled(ExternalLink)`
  ${CardRootMixin};

  &:hover {
    background-color: ${color("bg-light")};
  }
`;

export const CardHeaderStatic = styled.div`
  ${CardHeaderMixin};
`;

export const CardHeaderLink = styled(ExternalLink)`
  ${CardHeaderMixin};
`;

export const CardTitle = styled.span`
  display: block;
  flex: 1 1 auto;
  color: ${color("brand")};
  font-weight: bold;
  margin: 0 0.5rem;
`;

export const CardIcon = styled(Icon)`
  flex: 0 0 auto;
  color: ${color("brand")};
`;

export const CardMessage = styled.div`
  display: block;
  color: ${color("text-medium")};
  line-height: 1.25rem;

  p {
    margin: 0;
  }

  p:not(:last-child) {
    margin-bottom: 1.25rem;
  }

  a {
    color: ${color("brand")};
    cursor: pointer;
    font-weight: bold;
  }
`;
