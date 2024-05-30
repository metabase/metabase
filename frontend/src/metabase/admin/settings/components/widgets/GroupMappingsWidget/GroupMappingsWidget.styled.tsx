import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const GroupMappingsWidgetAndErrorRoot = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
`;

export const GroupMappingsWidgetRoot = styled.div`
  border: 1px solid var(--mb-color-border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  max-width: 720px;
  width: 100%;
`;

export const GroupMappingsWidgetHeader = styled.div`
  background-color: var(--mb-color-bg-light);
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
  display: flex;
  justify-content: space-between;
  margin-bottom: ${space(2)};
  padding: ${space(1)} ${space(2)};

  span {
    font-weight: 700;
  }
`;

export const GroupMappingsWidgetToggleRoot = styled.div`
  align-items: center;
  display: flex;

  > * {
    color: var(--mb-color-text-dark);
    padding-right: ${space(1)};
    padding-top: 0;
  }
`;

export const GroupMappingsWidgetAbout = styled.div`
  align-items: center;
  color: var(--mb-color-text-medium);
  display: flex;
  flex-direction: row;

  span {
    padding-left: ${space(1)};
  }
`;

export const GroupMappingsWidgetAboutContentRoot = styled.div`
  display: flex;
  align-items: center;
`;

export const AddMappingButton = styled(Button)`
  float: right;
  margin-right: ${space(2)};
  margin-bottom: -40px;
`;
