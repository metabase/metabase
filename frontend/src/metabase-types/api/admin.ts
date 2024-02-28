export type ApiKey = {
  name: string;
  id: number;
  group: {
    id: number;
    name: string;
  };
  creator_id: number;
  masked_key: string;
  created_at: string;
  updated_at: string;
  updated_by: {
    id: number;
    common_name: string;
  };
};

export interface Log {
  timestamp: string;
  process_uuid: string;
  fqns: string;
  msg: string;
  level: string;
  exception: any;
}
