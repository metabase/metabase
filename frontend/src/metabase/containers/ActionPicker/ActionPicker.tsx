import React, { useState } from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import EmptyState from "metabase/components/EmptyState";

import Actions from "metabase/entities/actions";
import type { WritebackAction } from "metabase-types/api";
import type { State } from "metabase-types/store";

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

          <ConnectedModelActionPicker
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
  value,
  onChange,
  actions,
}: {
  value: WritebackAction | undefined;
  onChange: (newValue: WritebackAction) => void;
  actions: WritebackAction[];
}) {
  if (!actions?.length) {
    return (
      <EmptyState
        message={t`There are no actions for this model`}
        action={t`Create new action`}
        link={"/action/create"}
      />
    );
  }

  return (
    <ul>
      {actions?.map(action => (
        <ActionOptionItem
          name={action.name ?? action.slug}
          description={action.description}
          isSelected={action.id === value?.id}
          key={action.slug}
          onClick={() => onChange(action)}
        />
      ))}
    </ul>
  );
}

const ConnectedModelActionPicker = Actions.loadList({
  query: (state: State, props: { modelId?: number | null }) => ({
    "model-id": props?.modelId,
  }),
})(ModelActionPicker);
