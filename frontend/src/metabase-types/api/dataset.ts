import { DownloadPermission } from "./permissions";

export interface DatasetColumn {
  display_name: string;
  source: string;
  name: string;
}

export interface Dataset {
  data: {
    rows: any[][];
    cols: DatasetColumn[];
    rows_truncated: number;
    download_perms?: DownloadPermission;
  };
  database_id: number;
  row_count: number;
  running_time: number;
}
