import React from "react";
import { t } from "ttag";
import _ from "underscore";
import { isEqual } from "lodash";

import { humanize } from "metabase/lib/formatting";
import { TemplateTags } from "metabase-types/types/Query";
import Utils from "metabase/lib/utils";

import { ActionType, WritebackAction } from "./types";
import { recognizeTemplateTags } from "metabase-lib/lib/queries/NativeQuery";
import { createTemplateTag } from "metabase-lib/lib/queries/TemplateTag";

type Data = any;

export type CreateActionHook = {
  type: ActionType;

  name: string;
  onNameChange: (name: string) => void;

  description: string;
  onDescriptionChange: (description: string) => void;

  data: Data;
  onDataChange: (data: Data) => void;

  responseHandler: string;
  onResponseHandlerChange: (responseHandler: string) => void;

  errorHandler: string;
  onErrorHandlerChange: (errorHandler: string) => void;

  isDirty: boolean;
  isValid: boolean;

  templateTags: TemplateTags;
  setTemplateTags: (templateTags: TemplateTags) => void;
};

const getName = (action: Partial<WritebackAction>): string => {
  if (action.type === "http") {
    return action.name || t`New Action`;
  } else if (action.type === "query") {
    return action.card?.name || t`New Action`;
  } else {
    throw new Error("Action type is not supported");
  }
};

const getDescription = (action: Partial<WritebackAction>): string => {
  if (action.type === "http") {
    return action?.description || "";
  } else if (action.type === "query") {
    return action.card?.description || "";
  } else {
    throw new Error("Action type is not supported");
  }
};

const getData = (action: Partial<WritebackAction>): unknown => {
  if (action.type === "http") {
    const { name, description, ...rest } = action;
    return rest || {};
  } else if (action.type === "query") {
    return action.card || {};
  } else {
    throw new Error("Action type is not supported");
  }
};

const getResponseHandler = (action: Partial<WritebackAction>): string => {
  if (action.type === "http") {
    return action.response_handle || "";
  } else {
    throw new Error("Action type is not supported");
  }
};

const getErrorHandler = (action: Partial<WritebackAction>): string => {
  if (action.type === "http") {
    return action.error_handle || "";
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
  const [responseHandler, setResponseHandler] = React.useState<string>(
    getResponseHandler(action),
  );
  const [errorHandler, setErrorHandler] = React.useState<string>(
    getErrorHandler(action),
  );
  const [data, setData] = React.useState<Data>(getData(action));
  const [isDirty, setIsDirty] = React.useState<boolean>(false);

  const [templateTags, setTemplateTags] = useTemplateTags(data);

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
    templateTags,
    setTemplateTags: newTags => {
      if (!isEqual(templateTags, newTags)) {
        setTemplateTags(newTags);
        setIsDirty(true);
      }
    },
    responseHandler,
    onResponseHandlerChange: newHandler => {
      if (responseHandler !== newHandler) {
        setResponseHandler(newHandler);
        setIsDirty(true);
      }
    },
    errorHandler,
    onErrorHandlerChange: newHandler => {
      if (errorHandler !== newHandler) {
        setErrorHandler(newHandler);
        setIsDirty(true);
      }
    },
  };
};

type SetTemplateTags = (tags: TemplateTags) => void;

// Adapted from NativeQuery._getUpdatedTemplateTags()
export const useTemplateTags = (data: any): [TemplateTags, SetTemplateTags] => {
  const [templateTags, setTemplateTags] = React.useState<TemplateTags | null>(
    null,
  );
  const tags = React.useMemo(() => {
    const queryText = JSON.stringify(data);
    if (queryText) {
      const tags = recognizeTemplateTags(queryText);
      const existingTags = Object.keys(templateTags || {});

      // if we ended up with any variables in the query then update the card parameters list accordingly
      if (tags.length > 0 || existingTags.length > 0) {
        const newTags = _.difference(tags, existingTags);

        const oldTags: string[] = _.difference(existingTags, tags);

        const newTemplateTags = { ...templateTags };

        if (oldTags.length === 1 && newTags.length === 1) {
          // renaming
          const newTag = { ...newTemplateTags[oldTags[0]] };

          if (newTag["display-name"] === humanize(oldTags[0])) {
            newTag["display-name"] = humanize(newTags[0]);
          }

          newTag.name = newTags[0];
          newTag.type = "text";

          newTemplateTags[newTag.name] = newTag;
          delete newTemplateTags[oldTags[0]];
        } else {
          // remove old vars
          for (const name of oldTags) {
            delete newTemplateTags[name];
          }

          // create new vars
          for (const tagName of newTags) {
            newTemplateTags[tagName] = createTemplateTag(tagName);
          }
        }

        // ensure all tags have an id since we need it for parameter values to work
        for (const tag of Object.values(newTemplateTags)) {
          if (tag.id == null) {
            tag.id = Utils.uuid();
          }
        }

        // The logic above is indiscriminant in creating new objects
        if (!isEqual(newTemplateTags, templateTags)) {
          return newTemplateTags;
        } else {
          return templateTags;
        }
      }
    }
    return INITIAL_TAGS;
  }, [data, templateTags]);

  React.useEffect(() => setTemplateTags(tags), [tags]);

  if (templateTags && Object.keys(templateTags).length > 0) {
    console.log(templateTags);
  }
  return [templateTags || INITIAL_TAGS, setTemplateTags];
};

const INITIAL_TAGS = {};
