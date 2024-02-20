import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const ListRoot = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
`;

export const ListFooter = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  margin-top: 0.5rem;
`;

export const ListThread = styled.div`
  height: 100%;
  border-left: 1px dashed ${color("border")};
`;

export const ListThreadContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1 1 auto;
  width: 2rem;
  height: 2rem;
`;

export const ListIcon = styled(Icon)`
  color: ${color("text-light")};
  width: 1.5rem;
  height: 1.5rem;
`;

export const ListIconText = styled.div`
  color: ${color("text-light")};
  margin-top: 0.375rem;
  margin-left: 0.75rem;
`;

export const ListIconContainer = styled.div`
  display: flex;
  margin-top: 0.5rem;
  margin-left: 0.675rem;
`;
