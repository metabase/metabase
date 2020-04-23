/* @flow */

import { t } from "ttag";

import { isDate } from "metabase/lib/schema_metadata";

import PivotByDrill from "./PivotByDrill";

export default PivotByDrill(t`Time`, "clock", field => isDate(field));
