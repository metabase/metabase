import { getDataFromClicked } from "metabase/lib/click-behavior";

import { openActionParametersModal } from "metabase/dashboard/actions";

import type { ActionClickObject } from "./types";

function ActionClickDrill({ clicked }: { clicked: ActionClickObject }) {
  const { dashcard } = clicked.extraData;
  const { onSubmit, missingParameters } = clicked;
  const { action } = dashcard;

  if (!action) {
    return [];
  }

  function clickAction() {
    if (missingParameters.length > 0) {
      return openActionParametersModal({
        dashcardId: dashcard.id,
        props: {
          missingParameters,
          onSubmit,
        },
      });
    }
    return onSubmit();
  }

  return [
    {
      name: "click_behavior",
      default: true,
      defaultAlways: true,
      action: clickAction,
    },
  ];
}

export default ActionClickDrill;
