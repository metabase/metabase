/* @flow */

import { isDate } from "metabase/lib/schema_metadata";

import PivotByAction from "./PivotByAction";

export default PivotByAction("Time", "clock", field => isDate(field));
