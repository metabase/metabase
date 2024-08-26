export interface Log {
  timestamp: string;
  process_uuid: string;
  fqns: string;
  msg: string;
  level: string;
  exception: any;
}

export interface MetabaseInfo {
  "application-database": string;
  "application-database-details": Record<string, any>;
  databases: string[];
  "hosting-env": string;
  "run-mode": string;
  settings: Record<string, any>;
  version: {
    date: string;
    hash: string;
    src_hash: string;
    tag: string;
  };
}

export interface SystemInfo {
  "file.encoding": string;
  "java.runtime.name": string;
  "java.runtime.version": string;
  "java.vendor": string;
  "java.vendor.url": string;
  "java.version": string;
  "java.vm.name": string;
  "java.vm.version": string;
  "os.name": string;
  "os.version": string;
  "user.language": string;
  "user.timezone": string;
}

export interface BugReportDetails {
  "metabase-info": MetabaseInfo;
  "system-info": SystemInfo;
}

export type LongTaskStatus = "incomplete" | "complete" | "aborted";
