import { screen, within } from "@testing-library/react";

import { checkNotNull } from "metabase/utils/types";

const getCardByLabel = (label: string, text: string) =>
  checkNotNull(
    screen
      .getAllByLabelText(label)
      .find((card) => within(card).queryByText(text) != null),
  );

export const getTimelineEventCheckbox = (eventName: string) =>
  within(getCardByLabel("Timeline event card", eventName)).getByRole(
    "checkbox",
  );

export const getTimelineCheckbox = (timelineName: string) =>
  within(getCardByLabel("Timeline card header", timelineName)).getByRole(
    "checkbox",
  );
