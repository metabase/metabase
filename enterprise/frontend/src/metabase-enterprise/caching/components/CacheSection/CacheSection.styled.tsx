import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import Input from "metabase/core/components/Input";
import { color } from "metabase/lib/colors";

export const CacheSectionRoot = styled.div`
  ${Button.Root} {
    padding: 0;
  }

  ${Button.Content} {
    justify-content: start;
  }
`;

export const Text = styled.span`
  font-weight: 700;
  font-size: 0.875rem;
  line-height: 1rem;
  margin: 0.5rem 0;
`;

export const CachePopover = styled.div`
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: end;

  ${Text} {
    margin-top: 0;
    margin-bottom: 1.5rem;
  }

  ${Input.Field} {
    width: 40px;
    height: 32px;
    font-size: 0.875rem;
    line-height: 1rem;
    padding: 0.625rem;
    margin: 0 0.5rem;
    border: 1px solid ${color("border")};
  }

  ${Button.Root} {
    width: 120px;
  }
`;
