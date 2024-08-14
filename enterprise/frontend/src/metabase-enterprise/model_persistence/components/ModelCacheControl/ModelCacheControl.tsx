import { useCallback, useState } from "react";
import { t } from "ttag";

import LoadingSpinner from "metabase/components/LoadingSpinner";
import Button from "metabase/core/components/Button";
import Databases from "metabase/entities/databases";
import { delay } from "metabase/lib/promise";
import { CardApi } from "metabase/services";
import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";

import { SpinnerContainer } from "./ModelCacheControl.styled";

interface ModelCacheControlProps {
  model: Question;
  size?: number;
  onChange?: (isPersisted: boolean) => void;
}

type DatabaseEntityLoaderProps = {
  database?: Database;
};

export const toggleModelPersistence = async (
  model: Question,
  onChange?: (isPersisted: boolean) => void,
) => {
  const id = model.id();
  const isPersisted = model.isPersisted();
  try {
    if (isPersisted) {
      await CardApi.unpersist({ id });
    } else {
      await CardApi.persist({ id });
    }
    onChange?.(!isPersisted);
  } catch (err) {
    console.warn("Failed to persist/unpersist model");
  } finally {
    await delay(200);
  }
};

function ModelCacheControl({
  model,
  size,
  onChange,
  ...props
}: ModelCacheControlProps) {
  const [isLoading, setLoading] = useState(false);
  const label = model.isPersisted() ? t`Unpersist model` : t`Persist model`;

  const handleClick = useCallback(async () => {
    setLoading(true);
    toggleModelPersistence(model, onChange);
    setLoading(false);
  }, [model, onChange]);

  return (
    <Databases.Loader id={model.databaseId()} loadingAndErrorWrapper={false}>
      {({ database }: DatabaseEntityLoaderProps) => {
        if (!database || !database["can-manage"]) {
          return null;
        }
        return isLoading ? (
          <SpinnerContainer>
            <LoadingSpinner size={size} />
          </SpinnerContainer>
        ) : (
          <Button
            {...props}
            icon="database"
            onClick={handleClick}
            iconSize={size}
          >
            {label}
          </Button>
        );
      }}
    </Databases.Loader>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModelCacheControl;
