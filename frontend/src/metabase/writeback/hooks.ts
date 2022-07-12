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

  isDirty: boolean;
  isValid: boolean;

  templateTags: TemplateTags;
  setTemplateTags: (templateTags: TemplateTags) => void;
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

  const json = React.useMemo(() => JSON.stringify(data), [data]);
  const [templateTags, setTemplateTags] = useTemplateTags(json);

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
    setTemplateTags,
  };
};

type SetTemplateTags = (tags: TemplateTags) => void;

// Adapted from NativeQuery._getUpdatedTemplateTags()
export const useTemplateTags = (
  queryText: string,
): [TemplateTags, SetTemplateTags] => {
  const [templateTags, setTemplateTags] = React.useState<TemplateTags | null>(
    null,
  );
  const tags = React.useMemo(() => {
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
  }, [queryText, templateTags]);

  React.useEffect(() => setTemplateTags(tags), [tags]);

  if (templateTags && Object.keys(templateTags).length > 0) {
    console.log(templateTags);
  }
  return [templateTags || INITIAL_TAGS, setTemplateTags];
};

const INITIAL_TAGS = {};
