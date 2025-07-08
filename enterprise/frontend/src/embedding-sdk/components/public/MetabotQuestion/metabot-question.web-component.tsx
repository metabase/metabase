import { WebComponentProviders } from "embedding-sdk/components/private/WebComponentProviders/WebComponentProviders";
import { defineWebComponent } from "embedding-sdk/lib/web-components";

import {
  type MetabaseProviderWebComponentContextProps,
  metabaseProviderContextProps,
} from "../metabase-provider.web-component";

import { MetabotQuestion } from "./MetabotQuestion";

defineWebComponent<MetabaseProviderWebComponentContextProps>(
  "metabot-question",
  ({ metabaseProviderProps }) => (
    <WebComponentProviders metabaseProviderProps={metabaseProviderProps}>
      <MetabotQuestion />
    </WebComponentProviders>
  ),
  {
    propTypes: {
      ...metabaseProviderContextProps,
    },
  },
);
