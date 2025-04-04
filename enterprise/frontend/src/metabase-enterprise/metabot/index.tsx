import { useMemo } from "react";
import { t } from "ttag";

import { METAKEY } from "metabase/lib/browser";
import type { PaletteAction } from "metabase/palette/types";
import {
  PLUGIN_GO_MENU,
  PLUGIN_METABOT,
  PLUGIN_REDUCERS,
} from "metabase/plugins";
import { Flex, Text } from "metabase/ui";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { Metabot } from "./components/Metabot";
import { MetabotContext, MetabotProvider, defaultContext } from "./context";
import { useMetabotAgent } from "./hooks";
import { metabotReducer, setVisible } from "./state";

if (hasPremiumFeature("metabot_v3")) {
  PLUGIN_METABOT.Metabot = Metabot;

  PLUGIN_METABOT.defaultMetabotContextValue = defaultContext;
  PLUGIN_METABOT.MetabotContext = MetabotContext;
  PLUGIN_METABOT.getMetabotProvider = () => MetabotProvider;
  PLUGIN_METABOT.useMetabotPalletteActions = (searchText: string) => {
    const { submitInput, setVisible } = useMetabotAgent();

    return useMemo(() => {
      const ret: PaletteAction[] = [
        {
          id: "initialize_metabot",
          name: searchText
            ? t`Ask Metabot, "${searchText}"`
            : t`Ask me to do something, or ask me a question`,
          section: "metabot",
          keywords: searchText,
          icon: "metabot",
          perform: (_currentActionImpl) => {
            setVisible(true);
            if (searchText) {
              submitInput(searchText);
            }
          },
        },
      ];
      return ret;
    }, [searchText, submitInput, setVisible]);
  };

  PLUGIN_REDUCERS.metabotPlugin = metabotReducer;

  PLUGIN_GO_MENU.getMenuItems = (dispatch) => [
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

/**
 * This is for Metabot in embedding
 *
 * TODO: Move this under a feature flag, but then we need to make our
 * store allowing injecting reducers dynamically since the store would
 * already be created before PLUGIN_REDUCERS.* is set via the dynamic EE plugin.
 */
PLUGIN_METABOT.getMetabotProvider = () => MetabotProvider;
PLUGIN_METABOT.defaultMetabotContextValue = defaultContext;
PLUGIN_METABOT.MetabotContext = MetabotContext;

PLUGIN_REDUCERS.metabotPlugin = metabotReducer;
