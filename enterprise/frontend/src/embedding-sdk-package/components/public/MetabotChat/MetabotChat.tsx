import type {
  MetabotChatProps,
  MetabotCommandBarProps,
  MetabotFloatingActionButtonProps,
} from "embedding-sdk-bundle/components/public/MetabotChat/types";
import { createComponent } from "embedding-sdk-package/components/private/ComponentWrapper/ComponentWrapper";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

const getBundle = () => getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE;

/**
 * A standalone chat panel for Metabot.
 *
 * @function
 * @category MetabotChat
 */
const MetabotChatBase = createComponent<MetabotChatProps>(
  () => getBundle()?.MetabotChat,
);

/**
 * Intercom-style floating action button that toggles a chat panel.
 *
 * @function
 * @category MetabotChat
 */
const FloatingActionButton = createComponent<MetabotFloatingActionButtonProps>(
  () => {
    const MetabotChat = getBundle()?.MetabotChat as any;
    return MetabotChat?.FloatingActionButton;
  },
);

/**
 * Centered bottom command bar that expands into a chat panel.
 *
 * @function
 * @category MetabotChat
 */
const CommandBar = createComponent<MetabotCommandBarProps>(() => {
  const MetabotChat = getBundle()?.MetabotChat as any;
  return MetabotChat?.CommandBar;
});

export const MetabotChat = Object.assign(MetabotChatBase, {
  FloatingActionButton,
  CommandBar,
});
