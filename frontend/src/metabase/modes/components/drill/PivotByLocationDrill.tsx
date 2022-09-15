import { t } from "ttag";

import { isAddress } from "metabase/lib/schema_metadata";
import { Field } from "metabase-types/types/Field";

import PivotByDrill from "./PivotByDrill";

export default PivotByDrill(t`Location`, "location", (field: Field) =>
  isAddress(field),
);
