import { t } from "ttag";

import { Icon } from "metabase/ui";
import visualizations from "metabase/visualizations";
import type { Series } from "metabase-types/api";

import { DashCardActionButton } from "../DashCardActionButton/DashCardActionButton";

import {
  ActionButton,
  IconContainer,
  PlusIcon,
} from "./AddSeriesButton.styled";

const { ICON_SIZE } = DashCardActionButton;

function getSeriesIconName(series: Series) {
  const display = series[0]?.card.display;
  return (
    visualizations.get(display === "scalar" ? "bar" : display)?.iconName ??
    "bar"
  );
}

export function AddSeriesButton({
  series,
  onClick,
}: {
  series: Series;
  onClick: () => void;
}) {
  const label = series.length > 1 ? t`Edit series` : t`Add series`;
  return (
    <ActionButton
      onClick={onClick}
      tooltip={label}
      aria-label={label}
      data-testid="add-series-button"
    >
      <IconContainer>
        <PlusIcon name="add" size={ICON_SIZE / 2} />
        <Icon name={getSeriesIconName(series)} size={ICON_SIZE - 2} />
      </IconContainer>
    </ActionButton>
  );
}
