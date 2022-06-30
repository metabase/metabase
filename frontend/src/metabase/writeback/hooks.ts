import React from "react";
import { t } from "ttag";
import cx from "classnames";
import { useMutation } from "react-query";

import { ActionsApi } from "metabase/services";
import { ActionType, CreateAction, SaveAction } from "./types";

type CreateActionOpts = { onSuccess?: () => void; onFailure?: () => void };

export type CreateActionHook = {
  type: ActionType;

  name: string;
  setName: (name: string) => void;

  description: string;
  setDescription: (description: string) => void;

  save: SaveAction;
};

export const useCreateAction = (
  type: ActionType,
  opts: CreateActionOpts = {},
) => {
  const [name, setName] = React.useState<string>("New Action");
  const [description, setDescription] = React.useState<string>("");

  const mutation = useMutation((actionData: CreateAction<ActionType>) => {
    return ActionsApi.create(actionData);
  }, opts);

  const save: SaveAction<ActionType> = React.useCallback(
    data => mutation.mutate({ name, type, description, ...data }),
    [name, type, description, mutation],
  );

  return {
    name,
    setName,
    type,
    description,
    setDescription,
    save,
  };
};
