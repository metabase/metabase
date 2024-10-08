import { jt, t } from "ttag";

import { isWithinIframe } from "metabase/lib/dom";
import { setUIControls } from "metabase/query_builder/actions";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import { Button, Text } from "metabase/ui";
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
      view: ({ dispatch }) => (
        <Text>{jt`${(
          <Button
            key="button"
            variant="subtle"
            p={0}
            onClick={() => dispatch(setUIControls({ modal: MODAL_TYPES.SAVE }))}
          >
            {t`Save`}
          </Button>
        )} this question to drill-thru.`}</Text>
      ),
    } as CustomClickActionWithCustomView,
  ];
};
