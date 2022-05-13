export type TextFieldFingerprint = {
  "type/Text": {
    "average-length": 13;
    "percent-email": 0;
    "percent-json": 0;
    "percent-state": 0;
    "percent-url": 0;
  };
};

export type NumberFieldFingerprint = {
  "type/Number": {
    avg: number;
    max: number;
    min: number;
    q1: number;
    q3: number;
    sd: number;
  };
};

export type DateTimeFieldFingerprint = {
  "type/DateTime": {
    earliest: "2016-04-26T19:29:55.147Z";
    latest: "2019-04-15T13:34:19.931Z";
  };
};

export interface FieldFingerprint {
  global: {
    "distinct-count"?: number;
    "nil%": 0;
  };
  type?:
    | TextFieldFingerprint
    | NumberFieldFingerprint
    | DateTimeFieldFingerprint;
}

export interface Field {
  id: number;
  table_id: number;
  name: string;
  base_type: string;
  description: string | null;
  nfc_path: string[] | null;

  fingerprint: FieldFingerprint;
}
