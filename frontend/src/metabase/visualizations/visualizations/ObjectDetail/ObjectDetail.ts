import { assignLazily } from "metabase/utils/merge-lazily";
import { ObjectDetail } from "metabase/visualizations/components/ObjectDetail";

import { OBJECT_DETAIL_DEFINITION } from "./definition";

const ObjectDetailWithProperties = assignLazily(
  ObjectDetail,
  OBJECT_DETAIL_DEFINITION,
);

export { ObjectDetailWithProperties as ObjectDetail };
