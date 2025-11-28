import { t } from "ttag";

import type {
  EntityTypeFilterValue,
  TasksFilterState,
} from "../../components/TasksFilterButton";

export const EMPTY_VALUE = "-";
export const SEARCH_DEBOUNCE_MS = 300;
export const PAGE_SIZE = 20;

export const INITIAL_FILTER_STATE: TasksFilterState = {
  entityTypes: [],
  creatorIds: [],
  lastModifiedByIds: [],
};

type EntityTypeOption = {
  value: EntityTypeFilterValue;
  label: string;
};

export const ENTITY_TYPE_OPTIONS: EntityTypeOption[] = [
  {
    value: "model",
    get label() {
      return t`Model`;
    },
  },
  {
    value: "question",
    get label() {
      return t`Question`;
    },
  },
  {
    value: "metric",
    get label() {
      return t`Metric`;
    },
  },
  {
    value: "table",
    get label() {
      return t`Table`;
    },
  },
  {
    value: "transform",
    get label() {
      return t`Transform`;
    },
  },
  {
    value: "dashboard",
    get label() {
      return t`Dashboard`;
    },
  },
  {
    value: "document",
    get label() {
      return t`Document`;
    },
  },
  {
    value: "snippet",
    get label() {
      return t`Snippet`;
    },
  },
  {
    value: "sandbox",
    get label() {
      return t`Sandbox`;
    },
  },
];

export const VALID_ENTITY_TYPES = new Set<string>(
  ENTITY_TYPE_OPTIONS.map((o) => o.value),
);
