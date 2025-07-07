export type DataApp = {
  id?: string;
  name: string;
  url: string;
  status: string; // private, published, archived
  entity_id?: string;
  created_at?: string;
  updated_at?: string;
};

export type DataAppEditSettings = {
  name: DataApp["name"];
  url: DataApp["url"];
};
