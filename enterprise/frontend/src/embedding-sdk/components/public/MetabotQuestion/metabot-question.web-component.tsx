import { defineWebComponent } from "embedding-sdk/lib/web-components";

import { MetabotQuestion } from "./MetabotQuestion";

defineWebComponent("metabot-question", () => <MetabotQuestion />, {
  propTypes: {},
});
