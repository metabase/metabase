import React, { useCallback } from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import Tooltip from "metabase/components/Tooltip";

import { CardApi } from "metabase/services";

import Question from "metabase-lib/lib/Question";

interface ModelCacheControlProps {
  model: Question;
  size?: number;
}

function ModelCacheControl({ model, size, ...props }: ModelCacheControlProps) {
  const isPersisted = model.isPersisted();
  const tooltip = isPersisted ? t`Unpersist model` : t`Persist model`;

  const handleClick = useCallback(async () => {
    const id = model.id();
    if (model.isPersisted()) {
      await CardApi.unpersist({ id });
    } else {
      await CardApi.persist({ id });
    }
  }, [model]);

  return (
    <Tooltip tooltip={tooltip}>
      <Button
        {...props}
        icon="database"
        onClick={handleClick}
        iconSize={size}
        onlyIcon
      />
    </Tooltip>
  );
}

export default ModelCacheControl;
