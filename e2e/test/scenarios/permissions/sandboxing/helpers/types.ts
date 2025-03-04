<<<<<<< HEAD
import type { Dataset } from "metabase-types/api";
||||||| parent of ee9077ecd5 (Test that sandboxing plays well with caching)
import type Question from "metabase-lib/v1/Question";
import type { Dashboard, Dataset } from "metabase-types/api";
=======
import type Question from "metabase-lib/v1/Question";
import type { Dashboard, Dataset } from "metabase-types/api";
import type Question from "metabase-lib/v1/Question";
import type { Dashboard, DatasetData } from "metabase-types/api";
import type { CollectionItem, Dashboard, Dataset } from "metabase-types/api";
>>>>>>> ee9077ecd5 (Test that sandboxing plays well with caching)

export type DatasetResponse = {
  body: Dataset;
  url: string;
  headers: any;
  statusCode: number;
};

export type DashcardQueryResponse = {
  body: Dataset;
<<<<<<< HEAD
  url: string;
  headers: any;
  statusCode: number;
||||||| parent of ee9077ecd5 (Test that sandboxing plays well with caching)
};

export type SandboxableItems = {
  dashboard: Dashboard;
  questions: Question[];
=======
};

export type SandboxableItems = {
  dashboard: Dashboard;
  questions: CollectionItem[];
>>>>>>> ee9077ecd5 (Test that sandboxing plays well with caching)
};
