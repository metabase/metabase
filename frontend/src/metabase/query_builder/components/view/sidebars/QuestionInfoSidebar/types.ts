export type AdhocQuestionData = {
  adhocQuestionURL: string;
  visualizationType: string;
};

export type PydanticModelSchemaName = "QueryWithViz";

export type QueryField = [string, number, { base_type: string }];
