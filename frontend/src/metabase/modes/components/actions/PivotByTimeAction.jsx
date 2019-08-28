/* @flow */

import { isDate } from "metabase/lib/schema_metadata";

import PivotByAction from "./PivotByAction";
import { t } from "ttag";

export default PivotByAction(t`Time`, "clock", field => isDate(field));
