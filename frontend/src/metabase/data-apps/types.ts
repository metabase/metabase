export type DataApp = {
  id: string;
  name: string;
  slug: string;
  status: string; // private, published, archived
  description: string;
  definition: DataAppDefinition;
  entity_id?: string;
  created_at?: string;
  updated_at?: string;
};

export type DataAppDefinition = {
  id: string;
  app_id: string;
  revision_number: number;
  config: object;
  entity_id: string;
  created_at: string;
};

export type DataAppDefinitionRelease = {
  id: string;
  app_id: string;
  app_definition_id: string;
  published_at: string;
  retracted: boolean;
};
