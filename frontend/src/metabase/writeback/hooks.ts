import React from "react";
import { t } from "ttag";
import { isEqual } from "lodash";

import { ActionType, WritebackAction } from "./types";

type Data = any;

export type CreateActionHook = {
  type: ActionType;

  name: string;
  onNameChange: (name: string) => void;

  description: string;
  onDescriptionChange: (description: string) => void;

  data: Data;
  onDataChange: (data: Data) => void;

  isDirty: boolean;
  isValid: boolean;
};

const getName = (action: Partial<WritebackAction>): string => {
  if (action.type === "http") {
    return action.name || t`New Action`;
  } else if (action.type === "row") {
    return action.card?.name || t`New Action`;
  } else {
    throw new Error("Action type is not supported");
  }
};

const getDescription = (action: Partial<WritebackAction>): string => {
  if (action.type === "http") {
    return action?.description || "";
  } else if (action.type === "row") {
    return action.card?.description || "";
  } else {
    throw new Error("Action type is not supported");
  }
};

const getData = (action: Partial<WritebackAction>): unknown => {
  if (action.type === "http") {
    const { name, description, ...rest } = action;
    return rest || {};
  } else if (action.type === "row") {
    return action.card || {};
  } else {
    throw new Error("Action type is not supported");
  }
};

export const useWritebackAction = (
  action: Partial<WritebackAction> & { type: ActionType },
): CreateActionHook => {
  const { type } = action;
  const [name, setName] = React.useState<string>(getName(action));
  const [description, setDescription] = React.useState<string>(
    getDescription(action),
  );
  const [data, setData] = React.useState<Data>(getData(action));
  const [isDirty, setIsDirty] = React.useState<boolean>(false);

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
    onNameChange: newName => {
      if (name !== newName) {
        setName(newName);
        setIsDirty(true);
      }
    },
    type,
    description,
    onDescriptionChange: newDescription => {
      if (newDescription !== description) {
        setDescription(newDescription);
        setIsDirty(true);
      }
    },
    data,
    onDataChange: newData => {
      if (!isEqual(data, newData)) {
        setData(newData);
        setIsDirty(true);
      }
    },
    isDirty,
    isValid,
  };
};
