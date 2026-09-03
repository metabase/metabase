import { ObjectDetail } from "metabase/visualizations/components/ObjectDetail";

import { OBJECT_DETAIL_DEFINITION } from "./definition";

const ObjectDetailWithProperties = Object.assign(
  ObjectDetail,
  OBJECT_DETAIL_DEFINITION,
);

export { ObjectDetailWithProperties as ObjectDetail };
