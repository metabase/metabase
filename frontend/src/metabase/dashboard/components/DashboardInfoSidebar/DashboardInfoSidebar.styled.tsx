import { css } from "@emotion/react";
import styled from "@emotion/styled";

import EditableText from "metabase/core/components/EditableText";
import FormField from "metabase/core/components/FormField/FormField";
import { color } from "metabase/lib/colors";
import { breakpointMaxSmall } from "metabase/styled-components/theme";

import { SIDEBAR_WIDTH } from "../Sidebar";

export const DashboardInfoSidebarRoot = styled.aside`
  width: ${SIDEBAR_WIDTH}px;
  min-width: ${SIDEBAR_WIDTH}px;
  background: ${color("white")};
  border-left: 1px solid ${color("border")};
  align-self: stretch;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;

  ${breakpointMaxSmall} {
    position: absolute;
    right: 0;
    z-index: 2;
    height: auto;
    border-bottom: 1px solid ${color("border")};
  }
`;

export const HistoryHeader = styled.h3`
  margin-bottom: 1rem;
`;

export const ContentSection = styled.div`
  padding: 2rem 0;
  border-bottom: 1px solid ${color("border")};

  &:first-of-type {
    padding-top: 1.5rem;
  }

  &:last-of-type {
    border-bottom: none;
  }

  ${EditableText.Root} {
    font-size: 1rem;
    line-height: 1.4rem;
    margin-left: -0.3rem;

    h1 {
      line-height: 1em;
    }
  }

  ${FormField.Root}:last-child {
    margin-bottom: 0;
  }
`;

export const DescriptionHeader = styled.h3`
  margin-bottom: 0.5rem;
`;

export const EditableDescription = styled(EditableText)<{ hasError?: boolean }>`
  ${props =>
    props.hasError &&
    css`
      border-color: ${color("error")};

      &:hover {
        border-color: ${color("error")};
      }
    `}
`;
