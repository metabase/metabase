import styled from "styled-components";
import ProgressBar from "metabase/components/ProgressBar";
import { color as c } from "metabase/lib/colors";

function getIndicationColor(percentage: number): string {
  if (percentage <= 0.5) {
    return c("danger");
  }
  return percentage >= 0.9 ? c("success") : c("warning");
}

function getDefaultProgressBarColor({
  percentage,
}: {
  percentage: number;
  color: string;
}) {
  const tooIncompleteMetadata = percentage <= 0.5;
  return tooIncompleteMetadata
    ? getIndicationColor(percentage)
    : c("bg-medium");
}

export const MetadataProgressBar = styled(ProgressBar)<{
  percentage: number;
  height: string | number;
}>`
  border-color: ${props => getDefaultProgressBarColor(props)};
  transition: border-color 0.3s;

  ${ProgressBar.Progress} {
    background-color: ${props => getDefaultProgressBarColor(props)};
    transition: background-color 0.3s;
  }
`;

export const PercentageLabel = styled.span`
  position: absolute;

  top: -1rem;
  left: 50%;
  transform: translate(-50%, 60%);

  font-size: 0.8rem;
  font-weight: bold;
  user-select: none;

  opacity: 0;

  transition: all 0.4s;
`;

export const Root = styled.div<{ percentage: number }>`
  display: flex;
  flex: 1;
  position: relative;
  flex-direction: column;

  ${PercentageLabel} {
    color: ${props => getIndicationColor(props.percentage)};
  }

  &:hover {
    ${PercentageLabel} {
      opacity: 1;
      transform: translate(-50%, 0);
    }

    ${MetadataProgressBar} {
      border-color: ${props => getIndicationColor(props.percentage)};

      ${ProgressBar.Progress} {
        background-color: ${props => getIndicationColor(props.percentage)};
      }
    }
  }
`;

export const TooltipParagraph = styled.p`
  margin: 0;
`;

export const TooltipContent = styled.div`
  ${TooltipParagraph}:last-child {
    margin-top: 1em;
  }
`;
