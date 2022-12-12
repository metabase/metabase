export type TextFieldFingerprint = {
  "average-length": number;
  "percent-email": number;
  "percent-json": number;
  "percent-state": number;
  "percent-url": number;
};

export type NumberFieldFingerprint = {
  avg: number;
  max: number;
  min: number;
  q1: number;
  q3: number;
  sd: number;
};

export type DateTimeFieldFingerprint = {
  earliest: "2016-04-26T19:29:55.147Z";
  latest: "2019-04-15T13:34:19.931Z";
};

export interface FieldFingerprint {
  global: {
    "distinct-count"?: number;
    "nil%": number;
  };
  type?: {
    "type/Text"?: TextFieldFingerprint;
    "type/Number"?: NumberFieldFingerprint;
    "type/DateTime"?: DateTimeFieldFingerprint;
  };
}

export interface Field {
  id?: number;
  dimensions?: FieldDimension;
  display_name: string;
  table_id: number | string;
  name: string;
  base_type: string;
  description: string | null;
  nfc_path: string[] | null;

  fingerprint?: FieldFingerprint;
}

export type FieldDimension = {
  name: string;
};
