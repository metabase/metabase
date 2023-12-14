import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";
import { css } from "@emotion/react";
import type { PaperProps, ButtonProps } from "metabase/ui";
import { Button, Paper, Title } from "metabase/ui";
import { PublicEmbedIcon, StaticEmbedIcon } from "../icons";

export const SharingPaneButtonTitle = styled(Title)``;
export const SharingPaneActionButton = styled(Button)<
  ButtonProps & HTMLAttributes<HTMLButtonElement>
>``;

export const StaticEmbedIconWrapper = styled(StaticEmbedIcon)``;

export const PublicEmbedIconWrapper = styled(PublicEmbedIcon)``;

export const SharingPaneButtonContent = styled(Paper)<
  PaperProps & { disabled?: boolean }
>`
  ${({ theme }) =>
    css`
      ${StaticEmbedIconWrapper} {
        rect.outerFill {
          stroke: ${theme.colors.bg[1]};
        }

        path.outerFill {
          fill: ${theme.colors.bg[1]};
        }

        .innerFill {
          fill: ${theme.colors.text[2]};
        }
      }

      ${PublicEmbedIconWrapper} {
        .outerFill {
          stroke: ${theme.colors.bg[1]};
        }

        .innerFill {
          stroke: ${theme.colors.text[2]};
        }
      }
    `}

  ${({ disabled, theme }) =>
    !disabled &&
    css`
      &:hover {
        ${SharingPaneActionButton} {
          background-color: ${theme.colors.brand[1]};
          color: white;
        }

        ${SharingPaneButtonTitle} {
          color: ${theme.colors.brand[1]};
        }

        ${StaticEmbedIconWrapper} {
          rect.outerFill {
            stroke: ${theme.colors.brand[0]};
          }

          path.outerFill {
            fill: ${theme.colors.brand[0]};
          }

          .innerFill {
            fill: ${theme.colors.brand[1]};
          }
        }

        ${PublicEmbedIconWrapper} {
          .outerFill {
            stroke: ${theme.colors.brand[0]};
          }

          .innerFill {
            stroke: ${theme.colors.brand[1]};
          }
        }
      }
    `}
`;
