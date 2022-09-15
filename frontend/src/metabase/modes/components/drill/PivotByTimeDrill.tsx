import { t } from "ttag";

import { isDate } from "metabase/lib/schema_metadata";
import { Field } from "metabase-types/types/Field";

import PivotByDrill from "./PivotByDrill";

export default PivotByDrill(t`Time`, "clock", (field: Field) => isDate(field));
