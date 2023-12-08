import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";
import { css } from "@emotion/react";
import { PublicEmbedIconWrapper } from "metabase/public/components/widgets/SharingPane/icons/PublicEmbedIcon/PublicEmbedIcon.styled";
import { StaticEmbedIconWrapper } from "metabase/public/components/widgets/SharingPane/icons/StaticEmbedIcon/StaticEmbedIcon.styled";
import type { PaperProps, ButtonProps } from "metabase/ui";
import { Button, Paper, Title } from "metabase/ui";

export const SharingPaneButtonTitle = styled(Title)``;
export const SharingPaneActionButton = styled(Button)<
  ButtonProps & HTMLAttributes<HTMLButtonElement>
>``;

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
