import {
  createWebComponent,
  registerWebComponent,
} from "embedding-sdk/lib/web-components";

import { MetabotQuestion } from "./MetabotQuestion";

const MetabotQuestionWebComponent = createWebComponent(
  () => <MetabotQuestion />,
  {
    propTypes: {},
  },
);

registerWebComponent("metabot-question", MetabotQuestionWebComponent);
