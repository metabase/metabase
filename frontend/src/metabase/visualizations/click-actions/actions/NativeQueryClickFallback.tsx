import { c } from "ttag";

import { MODAL_TYPES } from "metabase/querying/constants";
import { setUIControls } from "metabase/redux/query-builder";
import { Button, Flex } from "metabase/ui";
import { isWithinIframe } from "metabase/utils/iframe";
import type {
  CustomClickActionWithCustomView,
  LegacyDrill,
} from "metabase/visualizations/types";

import { nativeDrillFallback } from "./utils";

export const NativeQueryClickFallback: LegacyDrill = ({ question }) => {
  if (!nativeDrillFallback({ question })) {
    return [];
  }

  if (isWithinIframe()) {
    return [];
  }

  return [
    {
      name: "fallback-native",
      section: "info",
      type: "custom",
      view: ({ dispatch }) => {
        const button = (
          <Button
            key="save-button"
            variant="subtle"
            p={0}
            onClick={() => dispatch(setUIControls({ modal: MODAL_TYPES.SAVE }))}
          >
            {c('in the sentence "Save this question to drill-through"').t`Save`}
          </Button>
        );
        return (
          <Flex display="flex" align="baseline" gap="0.25rem">
            {c('in the sentence "Save this question to drill-through"').jt`${
              button
            } this question to drill-through.`}
          </Flex>
        );
      },
    } as CustomClickActionWithCustomView,
  ];
};
