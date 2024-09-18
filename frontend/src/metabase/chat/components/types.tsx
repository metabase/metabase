import { ReactNode } from "react";
import _ from "underscore";

export type AdhocQuestionData = {
  adhocQuestionURL: string;
  visualizationType: string;
};

export type PydanticModelSchemaName = "QueryWithViz";

export type QueryField = [string, number, { base_type: string }];

const isAuthor = (author: unknown): author is Author => {
  return author === "user" || author === "llm";
};

export const isMessage = (message: unknown): message is Message => {
  if (!_.isObject(message)) {
    return false;
  }
  if (!("content" in message)) {
    return false;
  }
  if (!("author" in message)) {
    return false;
  }
  if (!isAuthor(message.author)) {
    return false;
  }
  if (!_.isString(message.content)) {
    return false;
  }
  return true;
};

export type Author = "user" | "llm";

export type Message = {
  content: ReactNode;
  author: Author;
  newQuery?: any;
  toolCalls?: any[];
};
