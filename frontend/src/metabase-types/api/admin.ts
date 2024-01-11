export interface Log {
  timestamp: number;
  process_uuid: string;
  fqns: string;
  msg: string;
  level: string;
  exception: any;
}
