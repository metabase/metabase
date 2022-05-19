import React from "react";

import DimensionInfo from "metabase/components/MetadataInfo/DimensionInfo";
import Icon from "metabase/components/Icon";
import Field from "metabase-lib/lib/metadata/Field";

type Props = { field: Field };

function FieldPane({ field }: Props) {
  const dimension = field.dimension();

  return dimension ? (
    <div>
      <div className="flex align-center px2">
        <Icon name="field" className="text-medium pr1" size={16} />
        <h3 className="text-wrap">{field.name}</h3>
      </div>
      <DimensionInfo dimension={dimension} showAllFieldValues />
    </div>
  ) : null;
}

export default FieldPane;
