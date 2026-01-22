import type { ReactNode } from "react";

import type { MetabaseEmbeddingTheme } from "metabase/embedding-sdk/theme";

import type { MetabaseAuthConfig } from "./auth-config";
import type { SdkEventHandlersConfig } from "./events";
import type { MetabaseGlobalPluginsConfig } from "./plugins";
import type { SdkErrorComponent } from "./ui";

/**
 * @expand
 * @category MetabaseProvider
 */
export interface MetabaseProviderProps {
  /**
   * A custom class name to be added to the root element.
   *
   * @deprecated This prop is not used anymore.
   */
  className?: string;

  /**
   * The children of the MetabaseProvider component.
   */
  children: ReactNode;

  /**
   * Defines how to authenticate with Metabase.
   */
  authConfig: MetabaseAuthConfig;

  /**
   * See [Appearance](https://www.metabase.com/docs/latest/embedding/sdk/appearance).
   */
  theme?: MetabaseEmbeddingTheme;

  /**
   * See [Plugins](https://www.metabase.com/docs/latest/embedding/sdk/plugins).
   */
  pluginsConfig?: MetabaseGlobalPluginsConfig;

  /**
   * See [Global event handlers](https://www.metabase.com/docs/latest/embedding/sdk/config#global-event-handlers).
   */
  eventHandlers?: SdkEventHandlersConfig;

  /**
   * Defines the display language. Accepts an ISO language code such as `en` or `de`.
   * Defaults to the instance locale.
   **/
  locale?: string;

  /**
   * A custom loader component to display while the SDK is loading.
   *
   * The component receives an optional `label` prop that can be used to display a loading message.
   **/
  loaderComponent?: React.ComponentType<{ label?: string }>;

  /**
   * A custom error component to display when the SDK encounters an error.
   **/
  errorComponent?: SdkErrorComponent;

  /**
   * Whether to allow logging to the DevTools console. Defaults to true.
   **/
  allowConsoleLog?: boolean;
}
