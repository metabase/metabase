import { t } from "ttag";

import { isCategory, isAddress } from "metabase/lib/schema_metadata";
import { Field } from "metabase-types/types/Query";

import PivotByDrill from "./PivotByDrill";

export default PivotByDrill(
  t`Category`,
  "label",
  (field: Field) => isCategory(field) && !isAddress(field),
);
