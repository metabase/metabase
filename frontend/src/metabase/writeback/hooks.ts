import React from "react";
import { t } from "ttag";
import cx from "classnames";
import { useMutation } from "react-query";

import { ActionsApi } from "metabase/services";
import { ActionType, CreateAction } from "./types";
import { isEqual } from "lodash";

type CreateActionOpts = { onSuccess?: () => void; onError?: () => void };

type Data = any;

export type CreateActionHook = {
  type: ActionType;

  name: string;
  setName: (name: string) => void;

  description: string;
  setDescription: (description: string) => void;

  data: Data;
  setData: (data: Data) => void;

  save: () => void;
  isDirty: boolean;
  isValid: boolean;
  isSaving: boolean;
};

export const useCreateAction = (
  type: ActionType,
  { onSuccess, onError }: CreateActionOpts = {},
): CreateActionHook => {
  const [name, setName] = React.useState<string>("New Action");
  const [description, setDescription] = React.useState<string>("");
  const [data, setData] = React.useState<Data>({});
  const [isDirty, setIsDirty] = React.useState<boolean>(false);

  const mutation = useMutation(
    (actionData: CreateAction<ActionType>) => {
      return ActionsApi.create(actionData);
    },
    {
      onSuccess: () => {
        setIsDirty(false);
        onSuccess?.();
      },
      onError: () => {
        onError?.();
      },
    },
  );

  const save = React.useCallback(() => {
    if (type === "http") {
      const template = {
        method: data.template.method || "GET",
        url: data.template.url,
        body: data.template.body || "{}",
        headers: data.template.headers || "{}",
        parameters: {},
        parameter_mappings: {},
      };
      const error_handle = data.error_handle || {};
      const response_handle = data.error_handle || {};
      mutation.mutate({
        name,
        type,
        description,
        template,
        error_handle,
        response_handle,
      });
    } else {
      throw new Error(`Unknown action type: ${type}`);
    }
  }, [name, type, description, mutation, data]);

  const isValid = React.useMemo(() => {
    if (!name) {
      return false;
    }
    if (type === "http") {
      try {
        new URL(data.template?.url);
      } catch (_) {
        return false;
      }
      return true;
    }
    return false;
  }, [type, data, name]);

  return {
    name,
    setName: newName => {
      if (name !== newName) {
        setName(newName);
        setIsDirty(true);
      }
    },
    type,
    description,
    setDescription: newDescription => {
      if (newDescription !== description) {
        setDescription(newDescription);
        setIsDirty(true);
      }
    },
    save,
    data,
    setData: newData => {
      if (!isEqual(data, newData)) {
        setData(newData);
        setIsDirty(true);
      }
    },
    isDirty,
    isValid,
    isSaving: mutation.isLoading,
  };
};
