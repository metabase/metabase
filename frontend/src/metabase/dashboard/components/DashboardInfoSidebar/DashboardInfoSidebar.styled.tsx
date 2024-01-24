import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { breakpointMaxSmall } from "metabase/styled-components/theme";

import { color } from "metabase/lib/colors";
import EditableText from "metabase/core/components/EditableText";
import FormField from "metabase/core/components/FormField/FormField";

export const DashboardInfoSidebarRoot = styled.aside`
  width: 360px;
  padding: 0 2rem 0.5rem;
  background: ${color("white")};
  border-left: 1px solid ${color("border")};
  align-self: stretch;
  overflow-y: auto;
  box-sizing: border-box;

  ${breakpointMaxSmall} {
    position: absolute;
    width: 90%;
    right: 0px;
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

export const StyledEditableText = styled(EditableText)`
  ${({ loading }) =>
    loading &&
    css`
      border-radius: 0.5rem;
      --border-size: 2px;
      --border-angle: 0turn;
      background-image: conic-gradient(from var(--border-angle), #fff, #fff),
        conic-gradient(
          from var(--border-angle),
          transparent 5%,
          ${color("brand")},
          ${color("brand")}
        );
      background-size: calc(100% - (var(--border-size) * 2))
          calc(100% - (var(--border-size) * 2)),
        cover;
      background-position: center center;
      background-repeat: no-repeat;

      animation: bg-spin 2s linear infinite;
      @keyframes bg-spin {
        to {
          --border-angle: 1turn;
        }
      }

      @property --border-angle {
        syntax: "<angle>";
        inherits: true;
        initial-value: 0turn;
      }
    `}
`;
