import { t } from "ttag";

import { METAKEY } from "metabase/lib/browser";
import {
  PLUGIN_GO_MENU,
  PLUGIN_METABOT,
  PLUGIN_REDUCERS,
} from "metabase/plugins";
import { Flex, Text } from "metabase/ui";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { Metabot } from "./Metabot";
import { metabotReducer, setVisible } from "./state";

if (!!true || hasPremiumFeature("metabot_v3")) {
  PLUGIN_METABOT.Metabot = Metabot;

  PLUGIN_REDUCERS.metabotPlugin = metabotReducer;

  PLUGIN_GO_MENU.getMenuItems = dispatch => [
    {
      title: (
        <Flex align="center" justify="space-between" gap="md">
          <div>{t`Metabot request`}</div>
          <Text fz="sm" c="text-light">
            {METAKEY} + B
          </Text>
        </Flex>
      ),
      icon: "metabot",
      action: () => dispatch(setVisible(true)),
    },
  ];
}
