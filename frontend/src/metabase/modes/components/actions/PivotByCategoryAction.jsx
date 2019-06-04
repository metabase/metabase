/* @flow */

import { isCategory, isAddress } from "metabase/lib/schema_metadata";

import PivotByAction from "./PivotByAction";
import { t } from "ttag";

export default PivotByAction(
  t`Category`,
  "label",
  field => isCategory(field) && !isAddress(field),
);
