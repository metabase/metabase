/* @flow */

import { isAddress } from "metabase/lib/schema_metadata";

import PivotByAction from "./PivotByAction";
import { t } from "ttag";

export default PivotByAction(t`Location`, "location", field =>
  isAddress(field),
);
