import React from "react";

import DimensionInfo from "metabase/components/MetadataInfo/DimensionInfo";
import Icon from "metabase/components/Icon";
import Field from "metabase-lib/lib/metadata/Field";

type Props = { field: Field };

function FieldPane({ field }: Props) {
  const dimension = field.dimension();

  return dimension ? (
    <DimensionInfo dimension={dimension} showAllFieldValues />
  ) : null;
}

export default FieldPane;
