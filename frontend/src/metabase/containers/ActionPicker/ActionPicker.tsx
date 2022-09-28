import React, { useEffect, useState } from "react";
import { t } from "ttag";
import { ActionsApi } from "metabase/services";
import Button from "metabase/core/components/Button";

import type { WritebackAction } from "metabase-types/api";

import EmptyState from "metabase/components/EmptyState";
import ModelPicker from "../ModelPicker";
import ActionOptionItem from "./ActionOptionItem";

export default function ActionPicker({
  value,
  onChange,
}: {
  value: WritebackAction | undefined;
  onChange: (value: WritebackAction) => void;
}) {
  const [modelId, setModelId] = useState<number | undefined>(value?.model_id);

  return (
    <div className="scroll-y">
      {!modelId ? (
        <ModelPicker value={modelId} onChange={setModelId} />
      ) : (
        <>
          <Button
            icon="arrow_left"
            borderless
            onClick={() => setModelId(undefined)}
          >
            {t`Select Model`}
          </Button>
          <ModelActionPicker
            modelId={modelId}
            value={value}
            onChange={onChange}
          />
        </>
      )}
    </div>
  );
}

function ModelActionPicker({
  modelId,
  value,
  onChange,
}: {
  modelId: number;
  value: WritebackAction | undefined;
  onChange: (newValue: WritebackAction) => void;
}) {
  const [modelActions, setModelActions] = useState<WritebackAction[]>([]);

  useEffect(() => {
    ActionsApi.list({ "model-id": modelId }).then(setModelActions);
  }, [modelId]);

  return (
    <ul>
      {!modelActions?.length ? (
        <EmptyState
          message={t`There are no actions for this model`}
          action={t`Create new action`}
          link={"/action/create"}
        />
      ) : (
        modelActions?.map(action => (
          <ActionOptionItem
            name={action.name ?? action.slug}
            isSelected={action.id === value?.id}
            key={action.slug}
            onClick={() => onChange(action)}
          />
        ))
      )}
    </ul>
  );
}
