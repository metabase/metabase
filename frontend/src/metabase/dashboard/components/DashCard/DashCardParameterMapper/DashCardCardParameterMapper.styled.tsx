import styled from "@emotion/styled";
import ExternalLink from "metabase/core/components/ExternalLink";
import { Icon } from "metabase/core/components/Icon";
import { color } from "metabase/lib/colors";

import { space } from "metabase/styled-components/theme";

export const Container = styled.div<{ isSmall: boolean }>`
  margin: ${({ isSmall }) => (isSmall ? 0 : space(1))} 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  padding: 0.25rem;
`;

export const TextCardDefault = styled.div`
  color: ${color("text-dark")};
  margin: ${space(1)} 0;
  display: flex;
  flex-direction: row;
  align-items: baseline;
  line-height: 1.5rem;
`;

export const NativeCardDefault = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const NativeCardIcon = styled(Icon)`
  color: ${color("text-medium")};
  margin-bottom: 0.5rem;
  width: 1.25rem;
  height: 1.25rem;
`;

export const NativeCardText = styled.div`
  color: ${color("text-dark")};
  max-width: 15rem;
  text-align: center;
  line-height: 1.5rem;
`;

export const NativeCardLink = styled(ExternalLink)`
  color: ${color("brand")};
  font-weight: bold;
  margin-top: 0.5rem;
`;

export const CardLabel = styled.div`
  font-size: 0.83em;
  margin-bottom: ${space(1)};
  text-weight: bold;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
  max-width: 100px;
`;

export const Warning = styled.span`
  margin-top: ${space(1)};
  margin-bottom: -${space(1)};
  padding: ${space(4)} 0;
  text-align: center;
`;
