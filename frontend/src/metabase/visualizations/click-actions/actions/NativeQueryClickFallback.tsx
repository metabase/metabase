import { c } from "ttag";

import { isWithinIframe } from "metabase/lib/dom";
import { setUIControls } from "metabase/query_builder/actions";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import { Button, Flex } from "metabase/ui";
import type {
  CustomClickActionWithCustomView,
  LegacyDrill,
} from "metabase/visualizations/types";
import { nativeDrillFallback } from "metabase-lib/v1/queries/drills/native-drill-fallback";

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
